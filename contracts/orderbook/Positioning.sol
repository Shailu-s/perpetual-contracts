pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { LibAccountMarket } from "../libs/LibAccountMarket.sol";
import { LibOrder } from "../libs/LibOrder.sol";
import { LibFill } from "../libs/LibFill.sol";
import { LibDeal } from "../libs/LibDeal.sol";
import { LibAsset } from "../libs/LibAsset.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibSignature } from "../libs/LibSignature.sol";
import { EncodeDecode } from "../libs/EncodeDecode.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IERC1271 } from "../interfaces/IERC1271.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IIndexPrice } from "../interfaces/IIndexPrice.sol";
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";
import { IMarketRegistry } from "../interfaces/IMarketRegistry.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";

import { BlockContext } from "../helpers/BlockContext.sol";
import { FundingRate } from "../funding-rate/FundingRate.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { OrderValidator } from "./OrderValidator.sol";
import { PositioningStorageV1 } from "../storage/PositioningStorage.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";

// TODO : Create bulk match order for perp
// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Positioning is
    IPositioning,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    PositioningStorageV1,
    FundingRate,
    EIP712Upgradeable,
    OrderValidator
{
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibSafeCastInt for int256;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibSignature for bytes32;
    using EncodeDecode for bytes;
    uint256 private constant _ORACLE_BASE = 100000000;
    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address PositioningConfigArg,
        address vaultControllerArg,
        address accountBalanceArg,
        address matchingEngineArg,
        address markPriceArg,
        address indexPriceArg,
        uint64 underlyingPriceIndex
    ) external initializer {
        // P_VANC: Vault address is not contract
        require(vaultControllerArg.isContract(), "P_VANC");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "P_PCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "P_ABNC");
        // P_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "P_MENC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __FundingRate_init(markPriceArg, indexPriceArg);
        __OrderValidator_init_unchained();

        _positioningConfig = PositioningConfigArg;
        _vaultController = vaultControllerArg;
        _accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        _underlyingPriceIndex = underlyingPriceIndex;

        // TODO: Set settlement token
        // _settlementTokenDecimals = 0;
        setPositioning(address(this));
        _grantRole(POSITIONING_ADMIN, _msgSender());
    }

    function setMarketRegistry(address marketRegistryArg) external {
        _requirePositioningAdmin();
        // V_VPMM: Positioning is not contract
        require(marketRegistryArg.isContract(), "V_VPMM");
        _marketRegistry = marketRegistryArg;
    }

    /// @inheritdoc IPositioning
    function settleAllFunding(address trader) external virtual override {
        address[] memory baseTokens = IAccountBalance(_accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;
        for (uint256 i = 0; i < baseTokenLength; i++) {
            _settleFunding(trader, baseTokens[i]);
        }
    }

    /// @inheritdoc IPositioning
    function setDefaultFeeReceiver(address _newDefaultFeeReceiver) external onlyOwner {
        // Default Fee Receiver is zero
        require(_newDefaultFeeReceiver != address(0), "PC_DFRZ");
        defaultFeeReceiver = _newDefaultFeeReceiver;
        emit DefaultFeeReceiverChanged(defaultFeeReceiver);
    }

    /// @inheritdoc IPositioning
    function getPnlToBeRealized(RealizePnlParams memory params) public view override returns (int256) {
        LibAccountMarket.Info memory info =
            IAccountBalance(_accountBalance).getAccountInfo(params.trader, params.baseToken);

        int256 takerOpenNotional = info.takerOpenNotional;
        int256 takerPositionSize = info.takerPositionSize;
        // when takerPositionSize < 0, it's a short position; when base < 0, isBaseToQuote(shorting)
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != params.base < 0;

        return
            isReducingPosition
                ? _getPnlToBeRealized(
                    InternalRealizePnlParams({
                        trader: params.trader,
                        baseToken: params.baseToken,
                        takerPositionSize: takerPositionSize,
                        takerOpenNotional: takerOpenNotional,
                        base: params.base,
                        quote: params.quote
                    })
                )
                : int256(0);
    }

    /// @inheritdoc IPositioning
    function liquidate(
        address trader,
        address baseToken,
        int256 positionSize
    ) public override whenNotPaused nonReentrant {
        _liquidate(trader, baseToken, positionSize);
    }

    /// @inheritdoc IPositioning
    function liquidateFullPosition(address trader, address baseToken) external override whenNotPaused nonReentrant {
        // positionSizeToBeLiquidated = 0 means liquidating as much as possible
        _liquidate(trader, baseToken, 0);
    }

    /// @inheritdoc IPositioning
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight,
        bytes memory liquidator
    ) public override whenNotPaused nonReentrant {
        _validateFull(orderLeft, signatureLeft);
        _validateFull(orderRight, signatureRight);

        // short = selling base token
        address baseToken = orderLeft.isShort ? orderLeft.makeAsset.virtualToken : orderLeft.takeAsset.virtualToken;

        require(
            IMarketRegistry(_marketRegistry).checkBaseToken(baseToken),
            "V_PERP: Basetoken not registered at market"
        );

        // register base token for account balance calculations
        IAccountBalance(_accountBalance).registerBaseToken(orderLeft.trader, baseToken);
        IAccountBalance(_accountBalance).registerBaseToken(orderRight.trader, baseToken);

        // must settle funding first
        _settleFunding(orderLeft.trader, baseToken);
        _settleFunding(orderRight.trader, baseToken);

        _openPosition(orderLeft, orderRight, baseToken);
    }

    /// @inheritdoc IPositioning
    function getLiquidatablePosition(address trader, address baseToken) external view override returns (uint256) {
        int256 positionSize = _getTakerPosition(trader, baseToken);

        // P_PSZ: position size is zero
        require(positionSize != 0, "P_PSZ");

        uint24 partialCloseRatio = IPositioningConfig(_positioningConfig).getPartialLiquidationRatio();

        return positionSize.abs().mulRatio(partialCloseRatio);
    }

    /// @inheritdoc IPositioning
    function getPositioningConfig() public view override returns (address) {
        return _positioningConfig;
    }

    /// @inheritdoc IPositioning
    function getVaultController() public view override returns (address) {
        return _vaultController;
    }

    /// @inheritdoc IPositioning
    function getAccountBalance() public view override returns (address) {
        return _accountBalance;
    }

    ///@dev this function calculates total pending funding payment of a trader
    function getAllPendingFundingPayment(address trader)
        public
        view
        virtual
        override
        returns (int256 pendingFundingPayment)
    {
        address[] memory baseTokens = IAccountBalance(_accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;

        for (uint256 i = 0; i < baseTokenLength; i++) {
            pendingFundingPayment = pendingFundingPayment + (getPendingFundingPayment(trader, baseTokens[i]));
        }
        return pendingFundingPayment;
    }

    //
    // INTERNAL
    //

    function _getLiquidationPenaltyRatio() internal view returns (uint24) {
        return IPositioningConfig(_positioningConfig).getLiquidationPenaltyRatio();
    }

    function _liquidate(
        address trader,
        address baseToken,
        int256 positionSizeToBeLiquidated
    ) internal {
        // P_CLWTISO: cannot liquidate when there is still order
        // require(!IAccountBalance(_accountBalance).hasOrder(trader), "P_CLWTISO");

        // P_EAV: enough account value
        require(_isAccountLiquidatable(trader), "P_EAV");

        int256 positionSize = _getTakerPosition(trader, baseToken);

        // P_WLD: wrong liquidation direction
        require(positionSize * positionSizeToBeLiquidated >= 0, "P_WLD");

        address liquidator = _msgSender();

        _registerBaseToken(liquidator, baseToken);

        // must settle funding first
        _settleFunding(trader, baseToken);
        _settleFunding(liquidator, baseToken);

        int256 accountValue = _getAccountValue(trader);

        // trader's position is closed at index price and pnl realized
        (int256 liquidatedPositionSize, int256 liquidatedPositionNotional) =
            _getLiquidatedPositionSizeAndNotional(trader, baseToken, accountValue, positionSizeToBeLiquidated);
        _modifyPositionAndRealizePnl(trader, baseToken, liquidatedPositionSize, liquidatedPositionNotional, 0, 0);

        // trader pays liquidation penalty
        uint256 liquidationPenalty = liquidatedPositionNotional.abs().mulRatio(_getLiquidationPenaltyRatio());
        _modifyOwedRealizedPnl(trader, liquidationPenalty.neg256());

        // if there is bad debt, liquidation fees all go to liquidator; otherwise, split between liquidator & FR
        uint256 liquidationFeeToLiquidator = liquidationPenalty / 2;
        uint256 liquidationFeeToFR;
        if (accountValue < 0) {
            liquidationFeeToLiquidator = liquidationPenalty;
        } else {
            liquidationFeeToFR = liquidationPenalty - liquidationFeeToLiquidator;
            _modifyOwedRealizedPnl(_getFeeReceiver(), liquidationFeeToFR.toInt256());
        }

        // assume there is no longer any unsettled bad debt in the system
        // (so that true IF capacity = accountValue(IF) + USDC.balanceOf(IF))
        // if trader's account value becomes negative, the amount is the bad debt IF must have enough capacity to cover
        // {
        //     int256 accountValueAfterLiquidationX10_18 = _getAccountValue(trader);

        //     if (accountValueAfterLiquidationX10_18 < 0) {
        //         int256 insuranceFundCapacityX10_18 =
        //             IInsuranceFund(insuranceFund).getInsuranceFundCapacity().parseSettlementToken(
        //                 _settlementTokenDecimals
        //             );

        //         // P_IIC: insufficient insuranceFund capacity
        //         require(insuranceFundCapacityX10_18 >= accountValueAfterLiquidationX10_18.neg256(), "P_IIC");
        //     }
        // }

        // liquidator opens a position with liquidationFeeToLiquidator as a discount
        // liquidator's openNotional = -liquidatedPositionNotional + liquidationFeeToLiquidator
        int256 liquidatorExchangedPositionSize = liquidatedPositionSize.neg256();
        int256 liquidatorExchangedPositionNotional =
            liquidatedPositionNotional.neg256() + liquidationFeeToLiquidator.toInt256();
        // note that this function will realize pnl if it's reducing liquidator's existing position size
        _modifyPositionAndRealizePnl(
            liquidator,
            baseToken,
            liquidatorExchangedPositionSize, // exchangedPositionSize
            liquidatorExchangedPositionNotional, // exchangedPositionNotional
            0, // makerFee
            0 // takerFee
        );

        _requireEnoughFreeCollateral(liquidator);

        emit PositionLiquidated(
            trader,
            baseToken,
            liquidatedPositionNotional.abs(), // positionNotional
            liquidatedPositionSize.abs(), // positionSize
            liquidationPenalty,
            liquidator
        );

        // IVault(_vault).settleBadDebt(trader);
    }

    /// @dev Settle trader's funding payment to his/her realized pnl.
    function _settleFunding(address trader, address baseToken) internal returns (int256 growthTwPremium) {
        int256 fundingPayment;
        (fundingPayment, growthTwPremium) = settleFunding(trader, baseToken);

        if (fundingPayment != 0) {
            IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, fundingPayment.neg256());
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(_accountBalance).updateTwPremiumGrowthGlobal(trader, baseToken, growthTwPremium);
        return growthTwPremium;
    }

    /// @dev Add given amount to PnL of the address provided
    function _modifyOwedRealizedPnl(address trader, int256 amount) internal {
        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, amount);
    }

    function setPositioning(address PositioningArg) public override(PositioningCallee, IPositioning) {
        _Positioning = PositioningArg;
    }

    /// @dev this function matches the both orders and opens the position
    function _openPosition(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight,
        address baseToken
    ) internal returns (InternalData memory internalData) {
        LibFill.FillResult memory newFill = IMatchingEngine(_matchingEngine).matchOrders(orderLeft, orderRight);

        if (orderLeft.isShort) {
            internalData.leftExchangedPositionSize = newFill.leftValue.neg256();
            internalData.rightExchangedPositionSize = newFill.leftValue.toInt256();

            internalData.leftExchangedPositionNotional = newFill.rightValue.toInt256();
            internalData.rightExchangedPositionNotional = newFill.rightValue.neg256();
        } else {
            internalData.leftExchangedPositionSize = newFill.rightValue.toInt256();
            internalData.rightExchangedPositionSize = newFill.rightValue.neg256();

            internalData.leftExchangedPositionNotional = newFill.leftValue.neg256();
            internalData.rightExchangedPositionNotional = newFill.leftValue.toInt256();
        }

        // TODO: This is hardcoded right now but changes it during relayer development
        bool isLeftMaker = true;
        OrderFees memory orderFees =
            _calculateFees(
                isLeftMaker,
                internalData.leftExchangedPositionNotional,
                internalData.rightExchangedPositionNotional
            );

        // modifies PnL of fee receiver
        _modifyOwedRealizedPnl(_getFeeReceiver(), (orderFees.orderLeftFee + orderFees.orderRightFee).toInt256());

        // modifies positionSize and openNotional
        (internalData.leftPositionSize, internalData.leftOpenNotional) = IAccountBalance(_accountBalance)
            .modifyTakerBalance(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - orderFees.orderLeftFee.toInt256()
        );
        (internalData.rightPositionSize, internalData.rightOpenNotional) = IAccountBalance(_accountBalance)
            .modifyTakerBalance(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - orderFees.orderRightFee.toInt256()
        );

        if (_firstTradedTimestampMap[baseToken] == 0) {
            _firstTradedTimestampMap[baseToken] = _blockTimestamp();
        }

        // if not closing a position, check margin ratio after swap
        if (internalData.leftPositionSize != 0) {
            _requireEnoughFreeCollateral(orderLeft.trader);
        }

        if (internalData.rightPositionSize != 0) {
            _requireEnoughFreeCollateral(orderRight.trader);
        }

        emit PositionChanged(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional,
            orderFees.orderLeftFee,
            internalData.leftOpenNotional
        );

        emit PositionChanged(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            orderFees.orderRightFee,
            internalData.rightOpenNotional
        );

        IAccountBalance(_accountBalance).deregisterBaseToken(orderLeft.trader, baseToken);
        IAccountBalance(_accountBalance).deregisterBaseToken(orderRight.trader, baseToken);
        return internalData;
    }

    function _registerBaseToken(address trader, address token) internal {
        IAccountBalance(_accountBalance).registerBaseToken(trader, token);
    }

    /// @param positionSizeToBeLiquidated its direction should be the same as taker's existing position
    function _getLiquidatedPositionSizeAndNotional(
        address trader,
        address baseToken,
        int256 accountValue,
        int256 positionSizeToBeLiquidated
    ) internal view returns (int256, int256) {
        int256 maxLiquidatablePositionSize =
            IAccountBalance(_accountBalance).getLiquidatablePositionSize(trader, baseToken, accountValue);

        if (positionSizeToBeLiquidated.abs() > maxLiquidatablePositionSize.abs() || positionSizeToBeLiquidated == 0) {
            positionSizeToBeLiquidated = maxLiquidatablePositionSize;
        }

        int256 liquidatedPositionSize = positionSizeToBeLiquidated.neg256();
        int256 liquidatedPositionNotional =
            positionSizeToBeLiquidated.mulDiv(_getIndexPrice(baseToken).toInt256(), _ORACLE_BASE);

        return (liquidatedPositionSize, liquidatedPositionNotional);
    }

    function _getIndexPrice(address baseToken) internal view returns (uint256) {
        return IIndexPrice(baseToken).getIndexPrice(IPositioningConfig(_positioningConfig).getTwapInterval());
    }

    function _getPnlToBeRealized(InternalRealizePnlParams memory params) internal pure returns (int256) {
        // closedRatio is based on the position size
        uint256 closedRatio = (params.base.abs() * _FULLY_CLOSED_RATIO) / params.takerPositionSize.abs();

        int256 pnlToBeRealized;
        // if closedRatio <= 1, it's reducing or closing a position; else, it's opening a larger reverse position
        if (closedRatio <= _FULLY_CLOSED_RATIO) {
            int256 reducedOpenNotional = params.takerOpenNotional.mulDiv(closedRatio.toInt256(), _FULLY_CLOSED_RATIO);
            pnlToBeRealized = params.quote + reducedOpenNotional;
        } else {
            int256 closedPositionNotional = params.quote.mulDiv(int256(_FULLY_CLOSED_RATIO), closedRatio);
            pnlToBeRealized = params.takerOpenNotional + closedPositionNotional;
        }

        return pnlToBeRealized;
    }

    function _settleBalanceAndDeregister(
        address trader,
        address baseToken,
        int256 takerBase,
        int256 takerQuote,
        int256 realizedPnl,
        int256 makerFee
    ) internal {
        IAccountBalance(_accountBalance).settleBalanceAndDeregister(
            trader,
            baseToken,
            takerBase,
            takerQuote,
            realizedPnl,
            makerFee
        );
    }

    function _getTakerOpenNotional(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerOpenNotional(trader, baseToken);
    }

    /// @dev Calculate how much profit/loss we should realize,
    ///      The profit/loss is calculated by exchangedPositionSize/exchangedPositionNotional amount
    ///      and existing taker's base/quote amount.
    function _modifyPositionAndRealizePnl(
        address trader,
        address baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 makerFee,
        uint256 takerFee
    ) internal {
        int256 realizedPnl;
        if (exchangedPositionSize != 0) {
            realizedPnl = getPnlToBeRealized(
                RealizePnlParams({
                    trader: trader,
                    baseToken: baseToken,
                    base: exchangedPositionSize,
                    quote: exchangedPositionNotional
                })
            );
        }

        // realizedPnl is realized here
        // will deregister baseToken if there is no position
        _settleBalanceAndDeregister(
            trader,
            baseToken,
            exchangedPositionSize, // takerBase
            exchangedPositionNotional, // takerQuote
            realizedPnl,
            makerFee.toInt256()
        );

        emit PositionChanged(
            trader,
            baseToken,
            exchangedPositionSize,
            exchangedPositionNotional,
            takerFee, // fee
            _getTakerOpenNotional(trader, baseToken) // openNotional
        );
    }

    function _calculateFees(
        bool isLeftMaker,
        int256 leftExchangedPositionNotional,
        int256 rightExchangedPositionNotional
    ) internal view returns (OrderFees memory orderFees) {
        orderFees.orderLeftFee = isLeftMaker
            ? leftExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getMakerFeeRatio())
            : leftExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getTakerFeeRatio());

        orderFees.orderRightFee = isLeftMaker
            ? rightExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getTakerFeeRatio())
            : rightExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getMakerFeeRatio());
    }

    /// @dev this function validate the signature of order
    function _validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        _validate(order, signature);
    }

    /// @dev This function checks if account of trader is eligible for liquidation
    function _isAccountLiquidatable(address trader) internal view returns (bool) {
        return _getAccountValue(trader) < IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader);
    }

    /// @dev This function returns position size of trader
    function _getTakerPosition(address trader, address baseToken) internal view returns (int256) {
        int256 takerPositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
        // P_PSZ: position size is zero
        require(takerPositionSize != 0, "P_PSZ");
        return takerPositionSize;
    }

    /// @dev This function checks if free collateral of trader is available
    function _requireEnoughFreeCollateral(address trader) internal view {
        // P_NEFCI: not enough free collateral by imRatio
        require(_getFreeCollateralByRatio(trader, IPositioningConfig(_positioningConfig).getImRatio()) > 0, "P_NEFCI");
    }

    /// @dev this function returns address of the fee receiver
    function _getFeeReceiver() internal view returns (address) {
        return defaultFeeReceiver;
    }

    /// @dev this function returns total account value of the trader
    function _getAccountValue(address trader) internal view returns (int256) {
        return IVaultController(_vaultController).getAccountValue(trader);
    }

    /// @dev this function returns total free collateral available of trader
    function _getFreeCollateralByRatio(address trader, uint24 ratio) internal view returns (int256) {
        return IVaultController(_vaultController).getFreeCollateralByRatio(trader, ratio);
    }

    function _msgSender() internal view override(OwnerPausable, ContextUpgradeable) returns (address) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override(ContextUpgradeable) returns (bytes calldata) {
        return msg.data;
    }

    function _requirePositioningAdmin() internal view {
        require(hasRole(POSITIONING_ADMIN, _msgSender()), "Positioning: Not admin");
    }
}