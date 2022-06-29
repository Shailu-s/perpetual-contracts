// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { PerpMath } from "../libs/PerpMath.sol";
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
import "../interfaces/IIndexPrice.sol";
import "../interfaces/IBaseToken.sol";
import { FundingRate } from "../funding-rate/FundingRate.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Positioning is
    IPositioning,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    BaseRelayRecipient,
    PositioningStorageV1,
    FundingRate
{
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
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

    /// @param sqrtPriceLimitX96 tx will fill until it reaches this price but WON'T REVERT
    struct InternalOpenPositionParams {
        address trader;
        address baseToken;
        bool isShort;
        bool isClose;
        uint256 amount;
        bool isLiquidation;
        bytes signature;
    }

    struct InternalClosePositionParams {
        address trader;
        address baseToken;
        uint160 sqrtPriceLimitX96;
        bool isLiquidation;
    }

    struct InternalCheckSlippageParams {
        bool isBaseToQuote;
        bool isExactInput;
        uint256 base;
        uint256 quote;
        uint256 oppositeAmountBound;
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
        address quoteTokenArg,
        address exchangeArg,
        address accountBalanceArg,
        address insuranceFundArg
    ) public initializer {
        // CH_VANC: Vault address is not contract
        require(vaultArg.isContract(), "CH_VANC");
        // CH_QANC: QuoteToken address is not contract
        require(quoteTokenArg.isContract(), "CH_QANC");
        // CH_QDN18: QuoteToken decimals is not 18
        require(IERC20Metadata(quoteTokenArg).decimals() == 18, "CH_QDN18");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "CH_CCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "CH_ABNC");
        // CH_ENC: Exchange is not contract
        require(exchangeArg.isContract(), "CH_ENC");
        // CH_IFANC: InsuranceFund address is not contract
        require(insuranceFundArg.isContract(), "CH_IFANC");

        address orderBookArg = IExchange(exchangeArg).getOrderBook();
        // orderBook is not contract
        require(orderBookArg.isContract(), "CH_OBNC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _PositioningConfig = PositioningConfigArg;
        _vault = vaultArg;
        _quoteToken = quoteTokenArg;
        _exchange = exchangeArg;
        _orderBook = orderBookArg;
        _accountBalance = accountBalanceArg;
        _insuranceFund = insuranceFundArg;

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
        PositionParams memory positionLeft,
        bytes memory signatureLeft,
        PositionParams memory positionRight,
        bytes memory signatureRight
    )
        external
        override
        whenNotPaused
        nonReentrant
        checkDeadline(positionLeft.deadline)
        returns (uint256 base, uint256 quote)
    {
        require(positionLeft.isMaker, "Positioning: Left order should be maker");
        // register token if it's the first time
        IAccountBalance(_accountBalance).registerBaseToken(positionLeft.trader, positionLeft.baseToken);
        IAccountBalance(_accountBalance).registerBaseToken(positionRight.trader, positionRight.baseToken);

        // must settle funding first
        _settleFunding(positionLeft.trader, positionLeft.baseToken);
        _settleFunding(positionRight.trader, positionRight.baseToken);

        IExchange.SwapResponse memory response =
            _openPosition(
                InternalOpenPositionParams({
                    trader: positionLeft.trader,
                    baseToken: positionLeft.baseToken,
                    isShort: positionLeft.isShort,
                    isClose: false,
                    amount: positionLeft.amount,
                    isLiquidation: false,
                    signature: signatureLeft
                }),
                InternalOpenPositionParams({
                    trader: positionRight.trader,
                    baseToken: positionRight.baseToken,
                    isShort: positionRight.isShort,
                    isClose: false,
                    amount: positionRight.amount,
                    isLiquidation: false,
                    signature: signatureRight
                })
            );
        return (response.base, response.quote);
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
    function getOrderBook() external view override returns (address) {
        return _orderBook;
    }

    /// @inheritdoc IPositioning
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IPositioning
    function getInsuranceFund() external view override returns (address) {
        return _insuranceFund;
    }

    /// @inheritdoc IPositioning
    function getAccountValue(address trader) public view override returns (int256) {
        int256 fundingPayment = getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);
        // solhint-disable-next-line var-name-mixedcase
        int256 balanceX10_18 =
            SettlementTokenMath.parseSettlementToken(IVault(_vault).getBalance(trader), _settlementTokenDecimals);

        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl + pendingMakerFee
        return balanceX10_18.add(owedRealizedPnl.sub(fundingPayment)).add(unrealizedPnl).add(pendingFee.toInt256());
    }

    //
    // INTERNAL NON-VIEW
    //

    // /// @dev Calculate how much profit/loss we should settled,
    // /// only used when removing liquidity. The profit/loss is calculated by using
    // /// the removed base/quote amount and existing taker's base/quote amount.
    // function _settleBalanceAndRealizePnl(
    //     address maker,
    //     address baseToken,
    //     IOrderBook.RemoveLiquidityResponse memory response
    // ) internal returns (int256) {
    //     int256 pnlToBeRealized;
    //     if (response.takerBase != 0) {
    //         pnlToBeRealized = IExchange(_exchange).getPnlToBeRealized(
    //             IExchange.RealizePnlParams({
    //                 trader: maker,
    //                 baseToken: baseToken,
    //                 base: response.takerBase,
    //                 quote: response.takerQuote
    //             })
    //         );
    //     }

    //     // pnlToBeRealized is realized here
    //     IAccountBalance(_accountBalance).settleBalanceAndDeregister(
    //         maker,
    //         baseToken,
    //         response.takerBase,
    //         response.takerQuote,
    //         pnlToBeRealized,
    //         response.fee.toInt256()
    //     );

    //     return pnlToBeRealized;
    // }

    /// @dev explainer diagram for the relationship between exchangedPositionNotional, fee and openNotional:
    ///      https://www.figma.com/file/xuue5qGH4RalX7uAbbzgP3/swap-accounting-and-events
    function _openPosition(InternalOpenPositionParams memory params1, InternalOpenPositionParams memory params2)
        internal
        returns (IExchange.SwapResponse memory)
    {
        IExchange.SwapResponse memory response =
            IExchange(_exchange).swap(
                IExchange.SwapParams({
                    trader: params1.trader,
                    baseToken: params1.baseToken,
                    isShort: params1.isShort,
                    isClose: params1.isClose,
                    amount: params1.amount
                }),
                IExchange.SwapParams({
                    trader: params2.trader,
                    baseToken: params2.baseToken,
                    isShort: params2.isShort,
                    isClose: params2.isClose,
                    amount: params2.amount
                })
            );

        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(_insuranceFund, response.insuranceFundFee.toInt256());

        // examples:
        // https://www.figma.com/file/xuue5qGH4RalX7uAbbzgP3/swap-accounting-and-events?node-id=0%3A1
        IAccountBalance(_accountBalance).modifyTakerBalance(
            params2.trader,
            params2.baseToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional.sub(response.fee.toInt256())
        );

        if (response.pnlToBeRealized != 0) {
            IAccountBalance(_accountBalance).settleQuoteToOwedRealizedPnl(
                params1.trader,
                params1.baseToken,
                response.pnlToBeRealized
            );

            // if realized pnl is not zero, that means trader is reducing or closing position
            // trader cannot reduce/close position if bad debt happen
            // unless it's a liquidation from backstop liquidity provider
            // CH_BD: trader has bad debt after reducing/closing position
            require(
                (params1.isLiquidation &&
                    IPositioningConfig(_PositioningConfig).isBackstopLiquidityProvider(_msgSender())) ||
                    getAccountValue(params1.trader) >= 0,
                "CH_BD"
            );
        }

        // if not closing a position, check margin ratio after swap
        if (!params1.isClose) {
            _requireEnoughFreeCollateral(params1.trader);
        }

        int256 openNotional = IAccountBalance(_accountBalance).getTakerOpenNotional(params2.trader, params2.baseToken);
        emit PositionChanged(
            params1.trader,
            params1.baseToken,
            response.exchangedPositionSize,
            response.exchangedPositionNotional,
            response.fee,
            openNotional,
            response.pnlToBeRealized
        );

        IAccountBalance(_accountBalance).deregisterBaseToken(params1.trader, params1.baseToken);

        return response;
    }

    /// @dev Settle trader's funding payment to his/her realized pnl.
    function _settleFunding(address trader, address baseToken)
        internal
        returns (int256 growthTwPremium)
    {
        int256 fundingPayment;
        (fundingPayment, growthTwPremium) = settleFunding(trader, baseToken);

        if (fundingPayment != 0) {
            IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, fundingPayment.neg256());
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(_accountBalance).updateTwPremiumGrowthGlobal(trader, baseToken, growthTwPremium);
        return growthTwPremium;
    }

    //
    // INTERNAL VIEW
    //

    /// @inheritdoc BaseRelayRecipient
    function _msgSender()
        internal
        view
        override(BaseRelayRecipient, OwnerPausable, ContextUpgradeable)
        returns (address payable)
    {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData()
        internal
        view
        override(BaseRelayRecipient, OwnerPausable, ContextUpgradeable)
        returns (bytes memory)
    {
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

    function _checkSlippage(InternalCheckSlippageParams memory params) internal pure {
        // skip when params.oppositeAmountBound is zero
        if (params.oppositeAmountBound == 0) {
            return;
        }

        // B2Q + exact input, want more output quote as possible, so we set a lower bound of output quote
        // B2Q + exact output, want less input base as possible, so we set a upper bound of input base
        // Q2B + exact input, want more output base as possible, so we set a lower bound of output base
        // Q2B + exact output, want less input quote as possible, so we set a upper bound of input quote
        if (params.isBaseToQuote) {
            if (params.isExactInput) {
                // too little received when short
                require(params.quote >= params.oppositeAmountBound, "CH_TLRS");
            } else {
                // too much requested when short
                require(params.base <= params.oppositeAmountBound, "CH_TMRS");
            }
        } else {
            if (params.isExactInput) {
                // too little received when long
                require(params.base >= params.oppositeAmountBound, "CH_TLRL");
            } else {
                // too much requested when long
                require(params.quote <= params.oppositeAmountBound, "CH_TMRL");
            }
        }
    }
}
