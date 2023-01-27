// SPDX-License-Identifier: BUSL - 1.1
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
        address positioningConfigArg,
        address vaultControllerArg,
        address accountBalanceArg,
        address matchingEngineArg,
        address markPriceArg,
        address indexPriceArg,
        uint64 underlyingPriceIndex,
        address[2] calldata liquidators
    ) external initializer {
        // P_VANC: Vault address is not contract
        require(vaultControllerArg.isContract(), "P_VANC");
        // PositioningConfig address is not contract
        require(positioningConfigArg.isContract(), "P_PCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "P_ABNC");
        // P_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "P_MENC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __FundingRate_init(markPriceArg, indexPriceArg);
        __OrderValidator_init_unchained();

        _positioningConfig = positioningConfigArg;
        _vaultController = vaultControllerArg;
        _accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        _underlyingPriceIndex = underlyingPriceIndex;
        for (uint256 index = 0; index < 2; index++) {
            _isLiquidatorWhitelist[liquidators[index]] = true;
        }

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
    function setDefaultFeeReceiver(address newDefaultFeeReceiver) external onlyOwner {
        // Default Fee Receiver is zero
        require(newDefaultFeeReceiver != address(0), "PC_DFRZ");
        defaultFeeReceiver = newDefaultFeeReceiver;
        emit DefaultFeeReceiverChanged(defaultFeeReceiver);
    }

    function setIndexPriceOracle(address indexPriceOracle) external {
        _requirePositioningAdmin();
        // P_AZ: Index price oracle is address zero
        require(indexPriceOracle != address(0), "P_AZ");
        _indexPriceOracleArg = indexPriceOracle;
        emit IndexPriceSet(indexPriceOracle);
    }

    /// @inheritdoc IPositioning
    function whitelistLiquidator(address liquidator, bool isWhitelist) external {
        _requirePositioningAdmin();
        _isLiquidatorWhitelist[liquidator] = isWhitelist;
        if (!isWhitelist) {
            delete _isLiquidatorWhitelist[liquidator];
        }
        emit LiquidatorWhitelisted(liquidator, isWhitelist);
    }

    /// @inheritdoc IPositioning
    function getPnlToBeRealized(RealizePnlParams memory params) public view override returns (int256) {
        LibAccountMarket.Info memory info = IAccountBalance(_accountBalance).getAccountInfo(
            params.trader,
            params.baseToken
        );

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
    ) external override whenNotPaused nonReentrant {
        _liquidate(trader, baseToken, positionSize);
    }

    ///TODO: Test if this function liquidate full position even with when only partial was needed
    /// @inheritdoc IPositioning
    function liquidateFullPosition(address trader, address baseToken) external override whenNotPaused nonReentrant {
        // positionSizeToBeLiquidated = 0 means liquidating as much as possible
        _liquidate(trader, baseToken, 0);
    }

    /// @inheritdoc IPositioning
    // `liquidator` unused: we are keeping this for future implementation
    // when trader will be able to directly open position
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

    function getOrderValidate(LibOrder.Order memory order) public whenNotPaused nonReentrant returns (bool) {
        address baseToken = order.isShort ? order.makeAsset.virtualToken : order.takeAsset.virtualToken;
        require(
            IMarketRegistry(_marketRegistry).checkBaseToken(baseToken),
            "V_PERP: Basetoken not registered at market"
        );

        require(order.trader != address(0), "V_PERP_M: order verification failed");
        require(order.salt != 0, "V_PERP_M: 0 salt can't be used");
        require(order.salt >= makerMinSalt[_msgSender()], "V_PERP_M: order salt lower");

        LibOrder.validate(order);

        uint24 imRatio = IPositioningConfig(_positioningConfig).getImRatio();

        require(
            int256(order.isShort ? order.takeAsset.value : order.makeAsset.value) <
                _getFreeCollateralByRatio(order.trader, imRatio) * 1e6 / uint256(imRatio).toInt256(),
            "V_PERP_NEFC"
        );
        return true;
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

    /// @dev this function is used to fetch index price of base token
    function getIndexPrice(address baseToken) external view returns (uint256 indexPrice) {
        indexPrice = _getIndexPrice(baseToken);
    }

    /// @dev this function is used to know the trader is liquidateable
    function isAccountLiquidatable(address trader) external view returns (bool) {
        return _isAccountLiquidatable(trader);
    }

    /// @dev Used to fetch account value of a trader
    function getAccountValue(address trader) external view returns (int256 accountValue) {
        accountValue = _getAccountValue(trader);
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
        // P_EAV: enough account value
        require(_isAccountLiquidatable(trader), "P_EAV");
        address liquidator = _msgSender();
        _requireWhitelistLiquidator(liquidator);

        int256 positionSize = _getTakerPosition(trader, baseToken);

        // P_WLD: wrong liquidation direction
        require(positionSize * positionSizeToBeLiquidated >= 0, "P_WLD");

        _registerBaseToken(liquidator, baseToken);

        // must settle funding first
        _settleFunding(trader, baseToken);
        _settleFunding(liquidator, baseToken);

        int256 accountValue = _getAccountValue(trader);

        // trader's position is closed at index price and pnl realized
        (int256 liquidatedPositionSize, int256 liquidatedPositionNotional) =
            _getLiquidatedPositionSizeAndNotional(trader, baseToken, accountValue, positionSizeToBeLiquidated);
        _modifyPositionAndRealizePnl(trader, baseToken, liquidatedPositionSize, liquidatedPositionNotional, 0);

        // trader pays liquidation penalty
        uint256 liquidationPenalty = liquidatedPositionNotional.abs().mulRatio(_getLiquidationPenaltyRatio());
        _modifyOwedRealizedPnl(trader, liquidationPenalty.neg256(), baseToken);

        // if there is bad debt, liquidation fees all go to liquidator; otherwise, split between liquidator & FR
        uint256 liquidationFeeToLiquidator = liquidationPenalty / 2;
        uint256 liquidationFeeToFR;
        if (accountValue < 0) {
            liquidationFeeToLiquidator = liquidationPenalty;
        } else {
            liquidationFeeToFR = liquidationPenalty - liquidationFeeToLiquidator;
            _modifyOwedRealizedPnl(_getFeeReceiver(), liquidationFeeToFR.toInt256(), baseToken);
        }

        // liquidator opens a position with liquidationFeeToLiquidator as a discount
        // liquidator's openNotional = -liquidatedPositionNotional + liquidationFeeToLiquidator
        int256 liquidatorExchangedPositionSize = liquidatedPositionSize.neg256();
        int256 liquidatorExchangedPositionNotional = liquidatedPositionNotional.neg256() +
            liquidationFeeToLiquidator.toInt256();
        // note that this function will realize pnl if it's reducing liquidator's existing position size
        _modifyPositionAndRealizePnl(
            liquidator,
            baseToken,
            liquidatorExchangedPositionSize, // exchangedPositionSize
            liquidatorExchangedPositionNotional, // exchangedPositionNotional
            0 // makerFee
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
    }

    /// @dev Settle trader's funding payment to his/her realized pnl.
    function _settleFunding(address trader, address baseToken) internal returns (int256 growthTwPremium) {
        int256 fundingPayment;
        (fundingPayment, growthTwPremium) = settleFunding(trader, baseToken);

        if (fundingPayment != 0) {
            IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, fundingPayment.neg256(), baseToken);
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }

        IAccountBalance(_accountBalance).updateTwPremiumGrowthGlobal(trader, baseToken, growthTwPremium);
        return growthTwPremium;
    }

    /// @dev Add given amount to PnL of the address provided
    function _modifyOwedRealizedPnl(
        address trader,
        int256 amount,
        address baseToken
    ) internal {
        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, amount, baseToken);
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

        OrderFees memory orderFees = _calculateFees(
            true, // TODO: This is hardcoded right now but changes it during relayer development
            internalData.leftExchangedPositionNotional,
            internalData.rightExchangedPositionNotional
        );

        int256[2] memory realizedPnL;
        realizedPnL[0] = _realizePnLChecks(
            orderLeft,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional
        );
        realizedPnL[1] = _realizePnLChecks(
            orderRight,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional
        );

        // // modifies PnL of fee receiver
        _modifyOwedRealizedPnl(
            _getFeeReceiver(),
            (orderFees.orderLeftFee + orderFees.orderRightFee).toInt256(),
            baseToken
        );

        // // modifies positionSize and openNotional
        internalData.leftPositionSize = _settleBalanceAndDeregister(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - orderFees.orderLeftFee.toInt256(),
            realizedPnL[0],
            0
        );

        internalData.rightPositionSize = _settleBalanceAndDeregister(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - orderFees.orderRightFee.toInt256(),
            realizedPnL[1],
            0
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

        uint256 orderIndexPrice = _getIndexPrice(baseToken);

        emit PositionChanged(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional,
            orderFees.orderLeftFee,
            orderIndexPrice,
            orderLeft.orderType,
            orderLeft.isShort
        );

        emit PositionChanged(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            orderFees.orderRightFee,
            orderIndexPrice,
            orderRight.orderType,
            orderRight.isShort
        );

        return internalData;
    }

    function _registerBaseToken(address trader, address token) internal {
        IAccountBalance(_accountBalance).registerBaseToken(trader, token);
    }

    function _getTotalAbsPositionValue(address trader) internal view returns (uint256) {
        return IAccountBalance(_accountBalance).getTotalAbsPositionValue(trader);
    }

    function _realizePnLChecks(
        LibOrder.Order memory order,
        address baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional
    ) internal view returns (int256) {
        int256 takerPositionSize = _getTakerPosition(order.trader, baseToken);
        // get openNotional before swap
        int256 oldTakerOpenNotional = _getTakerOpenNotional(order.trader, baseToken);

        // when takerPositionSize < 0, it's a short position
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != order.isShort;
        // when reducing/not increasing the position size, it's necessary to realize pnl
        int256 pnlToBeRealized;
        if (isReducingPosition) {
            pnlToBeRealized = _getPnlToBeRealized(
                InternalRealizePnlParams({
                    trader: order.trader,
                    baseToken: baseToken,
                    takerPositionSize: takerPositionSize,
                    takerOpenNotional: oldTakerOpenNotional,
                    base: exchangedPositionSize,
                    quote: exchangedPositionNotional
                })
            );
        }

        if (pnlToBeRealized != 0) {
            // if realized pnl is not zero, that means trader is reducing or closing position
            // trader cannot reduce/close position if the remaining account value is less than
            // accountValue * LiquidationPenaltyRatio, which
            // enforces traders to keep LiquidationPenaltyRatio of accountValue to
            // shore the remaining positions and make sure traders having enough money to pay liquidation penalty.

            // CH_NEMRM : not enough minimum required margin after reducing/closing position
            require(
                _getAccountValue(order.trader) >=
                    _getTotalAbsPositionValue(order.trader).mulRatio(_getLiquidationPenaltyRatio()).toInt256(),
                "CH_NEMRM"
            );
        }
        return pnlToBeRealized;
    }

    /// @param positionSizeToBeLiquidated its direction should be the same as taker's existing position
    function _getLiquidatedPositionSizeAndNotional(
        address trader,
        address baseToken,
        int256 accountValue,
        int256 positionSizeToBeLiquidated
    ) internal view returns (int256, int256) {
        int256 maxLiquidatablePositionSize = IAccountBalance(_accountBalance).getLiquidatablePositionSize(
            trader,
            baseToken,
            accountValue
        );

        if (positionSizeToBeLiquidated.abs() > maxLiquidatablePositionSize.abs() || positionSizeToBeLiquidated == 0) {
            positionSizeToBeLiquidated = maxLiquidatablePositionSize;
        }

        int256 liquidatedPositionSize = positionSizeToBeLiquidated.neg256();
        int256 liquidatedPositionNotional = positionSizeToBeLiquidated.mulDiv(
            _getIndexPrice(baseToken).toInt256(),
            _ORACLE_BASE
        );

        return (liquidatedPositionSize, liquidatedPositionNotional);
    }

    function _getIndexPrice(address baseToken) internal view returns (uint256) {
        return IIndexPrice(baseToken).getIndexPrice(_underlyingPriceIndex);
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
    ) internal returns (int256) {
        return
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
        uint256 makerFee
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
        LibOrder.validate(order);
        _validate(order, signature);
    }

    /// @dev This function checks if account of trader is eligible for liquidation
    function _isAccountLiquidatable(address trader) internal view returns (bool) {
        return _getAccountValue(trader) < IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader);
    }

    /// @dev This function returns position size of trader
    function _getTakerPosition(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
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

    function _requireWhitelistLiquidator(address liquidator) internal view {
        require(_isLiquidatorWhitelist[liquidator], "Positioning: liquidator not whitelisted");
    }
}
