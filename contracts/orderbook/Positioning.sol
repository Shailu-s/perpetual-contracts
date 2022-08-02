// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { Funding } from "../libs/Funding.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IExchange } from "../interfaces/IExchange.sol";
import { IOrderBook } from "../interfaces/IOrderBook.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { BaseRelayRecipient } from "../gsn/BaseRelayRecipient.sol";
import { PositioningStorageV1 } from "../storage/PositioningStorage.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { AccountMarket } from "../libs/AccountMarket.sol";
import { OpenOrder } from "../libs/OpenOrder.sol";
import "../libs/LibAsset.sol";
import "../interfaces/IIndexPrice.sol";
import "../interfaces/IBaseToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Positioning is
    IPositioning,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    BaseRelayRecipient,
    PositioningStorageV1
{
    using AddressUpgradeable for address;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for uint128;
    using PerpMath for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;

    //
    // STRUCT
    //

    struct InternalOrderParams {
        address trader;
        uint64 deadline;
        bool isShort;
        bool isMaker;
        LibAsset.Asset makeAsset;
        LibAsset.Asset takeAsset;
        uint256 salt;
        bytes signature;
    }

    struct InternalClosePositionParams {
        address trader;
        address baseToken;
        uint160 sqrtPriceLimitX96;
        bool isLiquidation;
    }

    struct SwapResponse {
        uint256 base;
        uint256 quote;
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        uint256 fee;
        int256 pnlToBeRealized;
    }

    //
    // MODIFIER
    //

    modifier onlyExchange() {
        // only exchange
        // For caller validation purposes it would be more efficient and more reliable to use
        // "msg.sender" instead of "_msgSender()" as contracts never call each other through GSN.
        require(msg.sender == _exchange, "CH_OE");
        _;
    }

    modifier checkDeadline(uint256 deadline) {
        // transaction expires
        require(_blockTimestamp() <= deadline, "CH_TE");
        _;
    }

    mapping(address => uint256) public costBasis;

    //
    // EXTERNAL NON-VIEW
    //

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address PositioningConfigArg,
        address vaultArg,
        address exchangeArg,
        address accountBalanceArg
    ) public initializer {
        // CH_VANC: Vault address is not contract
        require(vaultArg.isContract(), "CH_VANC");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "CH_CCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "CH_ABNC");
        // CH_ENC: Exchange is not contract
        require(exchangeArg.isContract(), "CH_ENC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _PositioningConfig = PositioningConfigArg;
        _vault = vaultArg;
        _exchange = exchangeArg;
        _accountBalance = accountBalanceArg;

        _settlementTokenDecimals = IVault(_vault).decimals();
    }

    // solhint-disable-next-line func-order
    function setTrustedForwarder(address trustedForwarderArg) external onlyOwner {
        // CH_TFNC: TrustedForwarder is not contract
        require(trustedForwarderArg.isContract(), "CH_TFNC");
        _setTrustedForwarder(trustedForwarderArg);
        emit TrustedForwarderChanged(trustedForwarderArg);
    }

    /// @inheritdoc IPositioning
    function settleAllFunding(address trader) external override {
        address[] memory baseTokens = IAccountBalance(_accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;
        for (uint256 i = 0; i < baseTokenLength; i++) {
            _settleFunding(trader, baseTokens[i]);
        }
    }

    /// @inheritdoc IPositioning
    function openPosition(
        OrderParams memory orderLeft,
        bytes memory signatureLeft,
        OrderParams memory orderRight,
        bytes memory signatureRight
    ) public override whenNotPaused nonReentrant checkDeadline(orderLeft.deadline) {
        require(orderLeft.isMaker, "Positioning: Left order should be maker");
        // register token if it's the first time
        IAccountBalance(_accountBalance).registerBaseToken(orderLeft.trader, orderLeft.makeAsset.virtualToken);
        IAccountBalance(_accountBalance).registerBaseToken(orderRight.trader, orderRight.makeAsset.virtualToken);

        // must settle funding first
        _settleFunding(orderLeft.trader, orderLeft.makeAsset.virtualToken);
        _settleFunding(orderRight.trader, orderRight.makeAsset.virtualToken);

        IExchange.SwapResponse memory response =
            _openPosition(
                InternalOrderParams({
                    trader: orderLeft.trader,
                    deadline: orderLeft.deadline,
                    isShort: orderLeft.isShort,
                    isMaker: orderLeft.isMaker,
                    makeAsset: orderLeft.makeAsset,
                    takeAsset: orderLeft.takeAsset,
                    salt: orderLeft.salt,
                    signature: signatureLeft
                }),
                InternalOrderParams({
                    trader: orderRight.trader,
                    deadline: orderRight.deadline,
                    isShort: orderRight.isShort,
                    isMaker: orderRight.isMaker,
                    makeAsset: orderRight.makeAsset,
                    takeAsset: orderRight.takeAsset,
                    salt: orderRight.salt,
                    signature: signatureRight
                })
            );
    }

    /// @inheritdoc IPositioning
    function getQuoteToken() external view override returns (address) {
        return _quoteToken;
    }

    /// @inheritdoc IPositioning
    function getPositioningConfig() external view override returns (address) {
        return _PositioningConfig;
    }

    /// @inheritdoc IPositioning
    function getVault() external view override returns (address) {
        return _vault;
    }

    /// @inheritdoc IPositioning
    function getExchange() external view override returns (address) {
        return _exchange;
    }

    /// @inheritdoc IPositioning
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IPositioning
    function getAccountValue(address trader) public view override returns (int256) {
        int256 fundingPayment = IExchange(_exchange).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);
        // solhint-disable-next-line var-name-mixedcase
        int256 balanceX10_18 =
            SettlementTokenMath.parseSettlementToken(IVault(_vault).getBalance(trader), _settlementTokenDecimals);

        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl + pendingMakerFee
        return balanceX10_18 + (owedRealizedPnl - fundingPayment) + (unrealizedPnl) + (pendingFee.toInt256());
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @dev Calculate how much profit/loss we should settled,
    /// only used when removing liquidity. The profit/loss is calculated by using
    /// the removed base/quote amount and existing taker's base/quote amount.
    function _settleBalanceAndRealizePnl(
        address maker,
        address baseToken,
        IOrderBook.RemoveLiquidityResponse memory response
    ) internal returns (int256) {
        int256 pnlToBeRealized;
        if (response.takerBase != 0) {
            pnlToBeRealized = IExchange(_exchange).getPnlToBeRealized(
                IExchange.RealizePnlParams({
                    trader: maker,
                    baseToken: baseToken,
                    base: response.takerBase,
                    quote: response.takerQuote
                })
            );
        }

        // pnlToBeRealized is realized here
        IAccountBalance(_accountBalance).settleBalanceAndDeregister(
            maker,
            baseToken,
            response.takerBase,
            response.takerQuote,
            pnlToBeRealized,
            response.fee.toInt256()
        );

        return pnlToBeRealized;
    }

    /// @dev explainer diagram for the relationship between exchangedPositionNotional, fee and openNotional:
    ///      https://www.figma.com/file/xuue5qGH4RalX7uAbbzgP3/swap-accounting-and-events
    function _openPosition(InternalOrderParams memory params1, InternalOrderParams memory params2)
        internal
        returns (IExchange.SwapResponse memory)
    {
        IExchange.SwapResponse memory response =
            IExchange(_exchange).swap(
                IExchange.SwapParams({
                    trader: params1.trader,
                    baseToken: params1.makeAsset.virtualToken,
                    isShort: params1.isShort,
                    isClose: false,
                    amount: params1.makeAsset.value
                }),
                IExchange.SwapParams({
                    trader: params2.trader,
                    baseToken: params2.makeAsset.virtualToken,
                    isShort: params2.isShort,
                    isClose: false,
                    amount: params2.makeAsset.value
                })
            );

        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(_insuranceFund, response.insuranceFundFee.toInt256());

        // examples:
        // https://www.figma.com/file/xuue5qGH4RalX7uAbbzgP3/swap-accounting-and-events?node-id=0%3A1
        IAccountBalance(_accountBalance).modifyTakerBalance(
            params1.trader,
            params1.takeAsset.virtualToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional - response.fee.toInt256()
        );

        IAccountBalance(_accountBalance).modifyTakerBalance(
            params2.trader,
            params2.takeAsset.virtualToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional - response.fee.toInt256()
        );

        if (response.pnlToBeRealized != 0) {
            IAccountBalance(_accountBalance).settleQuoteToOwedRealizedPnl(
                params1.trader,
                params1.takeAsset.virtualToken,
                response.pnlToBeRealized
            );

            // if realized pnl is not zero, that means trader is reducing or closing position
            // trader cannot reduce/close position if bad debt happen
            // unless it's a liquidation from backstop liquidity provider
            // CH_BD: trader has bad debt after reducing/closing position
            // require(
            //     (params1.isLiquidation &&
            //         IPositioningConfig(_PositioningConfig).isBackstopLiquidityProvider(_msgSender())) ||
            //         getAccountValue(params1.trader) >= 0,
            //     "CH_BD"
            // );
        }

        // if not closing a position, check margin ratio after swap
        if (!params1.isShort) {
            _requireEnoughFreeCollateral(params1.trader);
        }

        if (!params2.isShort) {
            _requireEnoughFreeCollateral(params2.trader);
        }

        int256 openNotional1 =
            IAccountBalance(_accountBalance).getTakerOpenNotional(params1.trader, params1.takeAsset.virtualToken);
        int256 openNotional2 =
            IAccountBalance(_accountBalance).getTakerOpenNotional(params2.trader, params2.takeAsset.virtualToken);
        emit PositionChanged(
            params1.trader,
            params1.takeAsset.virtualToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional,
            response.fee,
            openNotional1,
            response.pnlToBeRealized
        );

        IAccountBalance(_accountBalance).deregisterBaseToken(params1.trader, params1.takeAsset.virtualToken);

        return response;
    }

    /// @dev Settle trader's funding payment to his/her realized pnl.
    /// TODO Create separate for settlement
    function _settleFunding(address trader, address baseToken)
        internal
        returns (Funding.Growth memory fundingGrowthGlobal)
    {
        int256 fundingPayment;
        (fundingPayment, fundingGrowthGlobal) = IExchange(_exchange).settleFunding(trader, baseToken);

        if (fundingPayment != 0) {
            IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, fundingPayment.neg256());
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(_accountBalance).updateTwPremiumGrowthGlobal(
            trader,
            baseToken,
            fundingGrowthGlobal.twPremiumX96
        );
        return fundingGrowthGlobal;
    }

    //
    // INTERNAL VIEW
    //

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }

    function _getFreeCollateralByRatio(address trader, uint24 ratio) internal view returns (int256) {
        return IVault(_vault).getFreeCollateralByRatio(trader, ratio);
    }

    function _requireEnoughFreeCollateral(address trader) internal view {
        // CH_NEFCI: not enough free collateral by imRatio
        require(
            _getFreeCollateralByRatio(trader, IPositioningConfig(_PositioningConfig).getImRatio()) >= 0,
            "CH_NEFCI"
        );
    }

    function _getPartialOppositeAmount(uint256 oppositeAmountBound, bool isPartialClose)
        internal
        view
        returns (uint256)
    {
        return
            isPartialClose
                ? oppositeAmountBound.mulRatio(IPositioningConfig(_PositioningConfig).getPartialCloseRatio())
                : oppositeAmountBound;
    }
}
