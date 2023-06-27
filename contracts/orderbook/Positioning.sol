// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import { LibAccountMarket } from "../libs/LibAccountMarket.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibSignature } from "../libs/LibSignature.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibOrder } from "../libs/LibOrder.sol";
import { LibFill } from "../libs/LibFill.sol";

import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVolmexBaseToken } from "../interfaces/IVolmexBaseToken.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";
import { IMarketRegistry } from "../interfaces/IMarketRegistry.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";

import { OrderValidator } from "./OrderValidator.sol";
import { FundingRate } from "../funding-rate/FundingRate.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Positioning is IPositioning, ReentrancyGuardUpgradeable, PausableUpgradeable, FundingRate, OrderValidator {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibSafeCastInt for int256;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibSignature for bytes32;

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address positioningConfigArg,
        address vaultControllerArg,
        address accountBalanceArg,
        address matchingEngineArg,
        address perpetualOracleArg,
        address marketRegistryArg,
        address[2] calldata volmexBaseTokenArgs,
        address[2] calldata liquidators,
        uint256[2] calldata _minPositionSizeByBaseToken
    ) external initializer {
        // P_VANC: Vault address is not contract
        require(vaultControllerArg.isContract(), "P_VANC");
        // PositioningConfig address is not contract
        require(positioningConfigArg.isContract(), "P_PCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "P_ABNC");
        // P_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "P_MENC");
        // P_MRNC:Market Registry  is not contract
        require(marketRegistryArg.isContract(), "P_MENC");
        __ReentrancyGuard_init();
        __Pausable_init_unchained();
        __FundingRate_init(perpetualOracleArg);
        __OrderValidator_init_unchained();

        positioningConfig = positioningConfigArg;
        vaultController = vaultControllerArg;
        accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        _marketRegistry = marketRegistryArg;
        _smInterval = 28800;
        _smIntervalLiquidation = 3600;
        indexPriceAllowedInterval = 1800;
        for (uint256 index = 0; index < 2; index++) {
            _underlyingPriceIndexes[volmexBaseTokenArgs[index]] = index;
            isLiquidatorWhitelisted[liquidators[index]] = true;
            minPositionSizeByBaseToken[volmexBaseTokenArgs[index]] = _minPositionSizeByBaseToken[index];
        }

        isLiquidatorWhitelistEnabled = true;
        _grantRole(SM_INTERVAL_ROLE, positioningConfigArg);
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
        address[] memory baseTokens = IAccountBalance(accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;
        for (uint256 i = 0; i < baseTokenLength; i++) {
            _settleFunding(trader, baseTokens[i]);
        }
    }

    /// @inheritdoc IPositioning
    function setDefaultFeeReceiver(address newDefaultFeeReceiver) external {
        _requirePositioningAdmin();
        // Default Fee Receiver is zero
        require(newDefaultFeeReceiver != address(0), "PC_DFRZ");
        defaultFeeReceiver = newDefaultFeeReceiver;
        emit DefaultFeeReceiverChanged(defaultFeeReceiver);
    }

    function setPerpetualOracle(address perpetualOracleArg) external {
        _requirePositioningAdmin();
        // P_AZ: Index price oracle is address zero
        require(perpetualOracleArg != address(0), "P_AZ");
        _perpetualOracleArg = perpetualOracleArg;
    }

    function setMinPositionSize(uint256 _minPositionSize, address baseToken) external {
        _requirePositioningAdmin();
        require(_minPositionSize >= 1e18, "P_MPSlT1");
        // P_MPSGT1: Min position size less than 1e18
        minPositionSizeByBaseToken[baseToken] = _minPositionSize;
    }

    /// @inheritdoc IPositioning
    function whitelistLiquidator(address liquidator, bool isWhitelist) external {
        _requirePositioningAdmin();
        isLiquidatorWhitelisted[liquidator] = isWhitelist;
        if (!isWhitelist) {
            delete isLiquidatorWhitelisted[liquidator];
        }
        emit LiquidatorWhitelisted(liquidator, isWhitelist);
    }

    /// @inheritdoc IPositioning
    function setFundingPeriod(uint256 period) external {
        _requirePositioningAdmin();
        _fundingPeriod = period;

        emit FundingPeriodSet(period);
    }

    function setSmInterval(uint256 smInterval) external virtual {
        _requireSmIntervalRole();
        _smInterval = smInterval;
    }

    function setSmIntervalLiquidation(uint256 smIntervalLiquidation) external virtual {
        _requireSmIntervalRole();
        _smIntervalLiquidation = smIntervalLiquidation;
    }

    function setIndexOracleInterval(uint256 _interval) external virtual {
        _requirePositioningAdmin();
        indexPriceAllowedInterval = _interval;
    }

    function toggleLiquidatorWhitelist() external {
        _requirePositioningAdmin();
        isLiquidatorWhitelistEnabled = !isLiquidatorWhitelistEnabled;
    }

    function pause() external {
        _requirePositioningAdmin();
        _pause();
    }

    function unpause() external {
        _requirePositioningAdmin();
        _unpause();
    }

    /// @inheritdoc IPositioning
    function liquidate(
        address trader,
        address baseToken,
        int256 positionSize
    ) external override whenNotPaused nonReentrant {
        require(!isStaleIndexOracle(baseToken), "P_SIP"); // stale index price
        _liquidate(trader, baseToken, positionSize);
    }

    ///Note for Auditor: Check full position liquidation even when partial was needed
    /// @inheritdoc IPositioning
    function liquidateFullPosition(address trader, address baseToken) external override whenNotPaused nonReentrant {
        require(!isStaleIndexOracle(baseToken), "P_SIP"); // stale index price
        // positionSizeToBeLiquidated = 0 means liquidating as much as possible
        _liquidate(trader, baseToken, 0);
    }

    /// @inheritdoc IPositioning
    // `liquidator` unused: we are keeping this for future implementation
    // when trader will be able to directly open position
    function openPosition(
        LibOrder.Order memory makerOrder,
        bytes memory signatureMaker,
        LibOrder.Order memory takerOrder,
        bytes memory signatureTaker,
        bytes memory liquidator
    ) external override whenNotPaused nonReentrant {
        // short = selling base token
        address baseToken = makerOrder.isShort ? makerOrder.makeAsset.virtualToken : makerOrder.takeAsset.virtualToken;

        require(!isStaleIndexOracle(baseToken), "P_SIP"); // stale index price
        _validateFull(makerOrder, signatureMaker);
        _validateFull(takerOrder, signatureTaker);

        require(IMarketRegistry(_marketRegistry).checkBaseToken(baseToken), "V_PBRM"); // V_PERP: Basetoken not registered at market = V_PBRM

        // register base token for account balance calculations
        IAccountBalance(accountBalance).registerBaseToken(makerOrder.trader, baseToken);
        IAccountBalance(accountBalance).registerBaseToken(takerOrder.trader, baseToken);

        // must settle funding first
        _settleFunding(makerOrder.trader, baseToken);
        _settleFunding(takerOrder.trader, baseToken);

        _openPosition(makerOrder, takerOrder, baseToken);
    }

    /// @inheritdoc IPositioning
    function getLiquidatablePosition(address trader, address baseToken) external view override returns (uint256) {
        int256 positionSize = _getTakerPosition(trader, baseToken);

        // P_PSZ: position size is zero
        require(positionSize != 0, "P_PSZ");

        uint24 partialCloseRatio = IPositioningConfig(positioningConfig).getPartialLiquidationRatio();

        return positionSize.abs().mulRatio(partialCloseRatio);
    }

    function getOrderValidate(LibOrder.Order memory order) external view returns (bool) {
        address baseToken = order.isShort ? order.makeAsset.virtualToken : order.takeAsset.virtualToken;
        uint256 minPositionSize = minPositionSizeByBaseToken[baseToken];
        int256 baseValue = order.isShort ? order.makeAsset.value.neg256() : order.takeAsset.value.toInt256();
        int256 currentTraderPositionSize = _getTakerPosition(order.trader, baseToken);
        int256 finalPositionSize = currentTraderPositionSize + baseValue;
        // V_PERP: Trader below min position size
        require(baseValue.abs() >= minPositionSize && (finalPositionSize.abs() >= minPositionSize || finalPositionSize.abs() == 0), "V_PERP: TBMPS");
        require(order.trader != address(0), "V_PERP_OVF"); // V_PERP_M: order verification failed
        require(order.salt != 0, "V_PERP_0S"); //V_PERP_M: 0 salt can't be used
        require(order.salt >= IMatchingEngine(_matchingEngine).makerMinSalt(order.trader), "V_PERP_LS"); // V_PERP_M: order salt lower
        bytes32 orderHashKey = LibOrder.hashKey(order);
        uint256 fills = IMatchingEngine(_matchingEngine).fills(orderHashKey);
        require(fills < order.makeAsset.value, "V_PERP_NF"); //V_PERP_NF:  nothing to fill
        LibOrder.validate(order);

        uint24 imRatio = IPositioningConfig(positioningConfig).getImRatio();

        require(
            int256(order.isShort ? order.takeAsset.value : order.makeAsset.value) < (_getFreeCollateralByRatio(order.trader, imRatio) * 1e6) / uint256(imRatio).toInt256(),
            "V_NEFC"
        );
        return true;
    }

    ///@dev this function calculates total pending funding payment of a trader
    function getAllPendingFundingPayment(address trader) external view virtual override returns (int256 pendingFundingPayment) {
        address[] memory baseTokens = IAccountBalance(accountBalance).getBaseTokens(trader);
        uint256 baseTokenLength = baseTokens.length;

        for (uint256 i = 0; i < baseTokenLength; i++) {
            pendingFundingPayment = pendingFundingPayment + (getPendingFundingPayment(trader, baseTokens[i]));
        }
        return pendingFundingPayment;
    }

    /// @dev Used to check for stale index oracle
    function isStaleIndexOracle(address baseToken) public view returns (bool) {
        uint256 index = _underlyingPriceIndexes[baseToken];
        uint256 lastUpdatedTimestamp = IPerpetualOracle(_perpetualOracleArg).lastestTimestamp(index, false);
        return block.timestamp - lastUpdatedTimestamp >= indexPriceAllowedInterval;
    }

    /// @inheritdoc IPositioning
    function getPnlToBeRealized(RealizePnlParams memory params) public view override returns (int256) {
        LibAccountMarket.Info memory info = IAccountBalance(accountBalance).getAccountInfo(params.trader, params.baseToken);

        int256 takerOpenNotional = info.openNotional;
        int256 takerPositionSize = info.positionSize;
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

    function _liquidate(
        address trader,
        address baseToken,
        int256 positionSizeToBeLiquidated
    ) internal {
        IAccountBalance accountBalanceInst = IAccountBalance(accountBalance);
        int256 accountValue = getAccountValue(trader);
        int256 feeCollateralByRatio = _getFreeCollateralByRatio(trader, IPositioningConfig(positioningConfig).getImRatio());
        // P_EAV: enough account value
        require(accountBalanceInst.isAccountLiquidatable(trader, baseToken, minPositionSizeByBaseToken[baseToken], accountValue, feeCollateralByRatio), "P_EAV");
        address liquidator = _msgSender();
        if (isLiquidatorWhitelistEnabled) {
            _requireWhitelistLiquidator(liquidator);
        }

        int256 positionSize = _getTakerPosition(trader, baseToken);

        // P_WLD: wrong liquidation direction
        require(positionSize * positionSizeToBeLiquidated >= 0, "P_WLD");
        accountBalanceInst.registerBaseToken(trader, baseToken);
        accountBalanceInst.checkAndUpdateLiquidationTimeToWait(trader, baseToken, accountValue, minPositionSizeByBaseToken[baseToken], feeCollateralByRatio);

        // must settle funding first
        _settleFunding(trader, baseToken);
        _settleFunding(liquidator, baseToken);

        // trader's position is closed at index price and pnl realized
        (int256 liquidatedPositionSize, int256 liquidatedPositionNotional) = _getLiquidatedPositionSizeAndNotional(trader, baseToken, accountValue, positionSizeToBeLiquidated);
        _modifyPositionAndRealizePnl(trader, baseToken, liquidatedPositionSize, liquidatedPositionNotional, 0);

        // trader pays liquidation penalty
        uint256 liquidationPenalty = liquidatedPositionNotional.abs().mulRatio(_getLiquidationPenaltyRatio());
        _modifyOwedRealizedPnl(trader, liquidationPenalty.neg256(), baseToken);

        // if there is bad debt, liquidation fees all go to liquidator; otherwise, split between liquidator & FR
        uint256 liquidationFeeToLiquidator = liquidationPenalty;
        if (accountValue >= 0) {
            liquidationFeeToLiquidator = liquidationPenalty.mulRatio(IPositioningConfig(positioningConfig).getLiquidatorFeeRatio());
            _modifyOwedRealizedPnl(defaultFeeReceiver, (liquidationPenalty - liquidationFeeToLiquidator).toInt256(), baseToken);
        }

        // liquidator opens a position with liquidationFeeToLiquidator as a discount
        // liquidator's openNotional = -liquidatedPositionNotional + liquidationFeeToLiquidator
        int256 liquidatorExchangedPositionSize = liquidatedPositionSize.neg256();
        int256 liquidatorExchangedPositionNotional = liquidatedPositionNotional.neg256() + liquidationFeeToLiquidator.toInt256();
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
    function _settleFunding(address trader, address baseToken) internal {
        (int256 fundingPayment, int256 globalTwPremiumGrowth) = settleFunding(trader, baseToken);
        uint256 baseTokenIndex = _underlyingPriceIndexes[baseToken];
        if(isChainlinkToken(baseTokenIndex)){
            IPerpetualOracle(_perpetualOracleArg).cacheChainlinkPrice(baseTokenIndex);
        }
        if (fundingPayment != 0) {
            IAccountBalance(accountBalance).modifyOwedRealizedPnl(trader, fundingPayment.neg256(), baseToken);
            emit FundingPaymentSettled(trader, baseToken, fundingPayment);
        }
        if (globalTwPremiumGrowth != 0) {
            IAccountBalance(accountBalance).updateTwPremiumGrowthGlobal(trader, baseToken, globalTwPremiumGrowth);
        }
    }

    /// @dev Add given amount to PnL of the address provided
    function _modifyOwedRealizedPnl(
        address trader,
        int256 amount,
        address baseToken
    ) internal {
        IAccountBalance(accountBalance).modifyOwedRealizedPnl(trader, amount, baseToken);
    }

    /// @dev this function matches the both orders and opens the position
    function _openPosition(
        LibOrder.Order memory makerOrder,
        LibOrder.Order memory takerOrder,
        address baseToken
    ) internal returns (InternalData memory internalData) {
        LibFill.FillResult memory newFill = IMatchingEngine(_matchingEngine).matchOrders(makerOrder, takerOrder);

        if (makerOrder.isShort) {
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

        OrderFees memory orderFees =
            _calculateFees(
                true, // left order is maker
                internalData.leftExchangedPositionNotional,
                internalData.rightExchangedPositionNotional
            );

        int256[2] memory realizedPnL;
        realizedPnL[0] = _realizePnLChecks(
            makerOrder,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - orderFees.makerOrderFee.toInt256()
        );
        realizedPnL[1] = _realizePnLChecks(
            takerOrder,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - orderFees.takerOrderFee.toInt256()
        );

        // modifies PnL of fee receiver
        _modifyOwedRealizedPnl(defaultFeeReceiver, (orderFees.makerOrderFee + orderFees.takerOrderFee).toInt256(), baseToken);

        // modifies positionSize and openNotional
        internalData.leftPositionSize = _settleBalanceAndDeregister(
            makerOrder.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - orderFees.makerOrderFee.toInt256(),
            realizedPnL[0],
            0
        );

        internalData.rightPositionSize = _settleBalanceAndDeregister(
            takerOrder.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - orderFees.takerOrderFee.toInt256(),
            realizedPnL[1],
            0
        );

        if (_firstTradedTimestampMap[baseToken] == 0) {
            _firstTradedTimestampMap[baseToken] = block.timestamp;
        }

        // if not closing a position, check margin ratio after swap
        if (internalData.leftPositionSize != 0) {
            _requireEnoughFreeCollateral(makerOrder.trader);
        }

        if (internalData.rightPositionSize != 0) {
            _requireEnoughFreeCollateral(takerOrder.trader);
        }

        _updateTokenAmount(makerOrder.trader, baseToken);
        _updateTokenAmount(takerOrder.trader, baseToken);

        emit PositionChanged(
            [makerOrder.trader, takerOrder.trader],
            baseToken,
            [internalData.leftExchangedPositionSize, internalData.rightExchangedPositionSize],
            [internalData.leftExchangedPositionNotional, internalData.rightExchangedPositionNotional],
            [orderFees.makerOrderFee, orderFees.takerOrderFee],
            [makerOrder.orderType, takerOrder.orderType],
            [makerOrder.isShort, takerOrder.isShort]
        );
    }

    function _updateTokenAmount(address trader, address baseToken) internal {
        int256 position = _getTakerPosition(trader, baseToken);
        int256 notional = _getTakerOpenNotional(trader, baseToken);
        address quoteToken = IMarketRegistry(_marketRegistry).getQuoteToken();
        if (position > 0) {
            uint256 currentBalance = IVirtualToken(baseToken).balanceOf(trader);
            if (currentBalance != 0) {
                IVirtualToken(baseToken).burn(trader, currentBalance);
            }
            IVirtualToken(baseToken).mint(trader, uint256(position));
        }
        if (notional > 0) {
            uint256 currentBalance = IVirtualToken(quoteToken).balanceOf(trader);
            if (currentBalance != 0) {
                IVirtualToken(quoteToken).burn(trader, currentBalance);
            }
            IVirtualToken(quoteToken).mint(trader, uint256(notional));
        }
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
            realizedPnl = getPnlToBeRealized(RealizePnlParams({ trader: trader, baseToken: baseToken, base: exchangedPositionSize, quote: exchangedPositionNotional }));
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

    function _settleBalanceAndDeregister(
        address trader,
        address baseToken,
        int256 takerBase,
        int256 takerQuote,
        int256 realizedPnl,
        int256 makerFee
    ) internal returns (int256) {
        return IAccountBalance(accountBalance).settleBalanceAndDeregister(trader, baseToken, takerBase, takerQuote, realizedPnl, makerFee);
    }

    function _getLiquidationPenaltyRatio() internal view returns (uint24) {
        return IPositioningConfig(positioningConfig).getLiquidationPenaltyRatio();
    }

    function _getTotalAbsPositionValue(address trader) internal view returns (uint256) {
        return IAccountBalance(accountBalance).getTotalAbsPositionValue(trader);
    }

    function _realizePnLChecks(
        LibOrder.Order memory order,
        address baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional
    ) internal view returns (int256) {
        int256 takerPositionSize = _getTakerPosition(order.trader, baseToken);
        uint256 minPositionSize = minPositionSizeByBaseToken[baseToken];
        int256 baseValue = order.isShort ? order.makeAsset.value.neg256() : order.takeAsset.value.toInt256();
        int256 finalPositionSize = baseValue + takerPositionSize;
        // V_PERP: Trader below min position size
        require((finalPositionSize.abs() >= minPositionSize || finalPositionSize == 0) && baseValue.abs() >= minPositionSize, "V_PERP: TBMPS");
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
            require(getAccountValue(order.trader) >= _getTotalAbsPositionValue(order.trader).mulRatio(_getLiquidationPenaltyRatio()).toInt256(), "CH_NEMRM");
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
        int256 maxLiquidatablePositionSize = IAccountBalance(accountBalance).getLiquidatablePositionSize(trader, baseToken, accountValue);

        if (positionSizeToBeLiquidated.abs() > maxLiquidatablePositionSize.abs() || positionSizeToBeLiquidated == 0) {
            positionSizeToBeLiquidated = maxLiquidatablePositionSize;
        }

        uint256 indexPrice = getIndexPrice(baseToken, _smIntervalLiquidation);
        require(indexPrice != 0, "P_0IP"); // zero index price
        uint256 maxOrderSize = IMatchingEngine(_matchingEngine).getMaxOrderSizeOverTime(baseToken);
        uint256 actualLiquidatableSize = IAccountBalance(accountBalance).getNLiquidate(positionSizeToBeLiquidated.abs(), minPositionSizeByBaseToken[baseToken], maxOrderSize);
        int256 liquidatedPositionSize = positionSizeToBeLiquidated >= 0 ? (actualLiquidatableSize.toInt256()).neg256() : actualLiquidatableSize.toInt256();
        int256 liquidatedPositionNotional = liquidatedPositionSize.mulDiv(indexPrice.toInt256(), _ORACLE_BASE);

        return (liquidatedPositionSize, liquidatedPositionNotional);
    }

    function getIndexPrice(address baseToken, uint256 twInterval) public view returns (uint256 price) {
        uint256 index = _underlyingPriceIndexes[baseToken];
        price = IVolmexBaseToken(baseToken).getIndexPrice(index, twInterval);
    }

    function _getTakerOpenNotional(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(accountBalance).getOpenNotional(trader, baseToken);
    }

    function _calculateFees(
        bool isLeftMaker,
        int256 leftExchangedPositionNotional,
        int256 rightExchangedPositionNotional
    ) internal view returns (OrderFees memory orderFees) {
        orderFees.makerOrderFee = isLeftMaker
            ? leftExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getMakerFeeRatio())
            : leftExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getTakerFeeRatio());

        orderFees.takerOrderFee = isLeftMaker
            ? rightExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getTakerFeeRatio())
            : rightExchangedPositionNotional.abs().mulRatio(IMarketRegistry(_marketRegistry).getMakerFeeRatio());
    }

    /// @dev this function validate the signature of order
    function _validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        _validate(order, signature);
    }

    /// @dev This function returns position size of trader
    function _getTakerPosition(address trader, address baseToken) internal view returns (int256) {
        return IAccountBalance(accountBalance).getPositionSize(trader, baseToken);
    }

    /// @dev This function checks if free collateral of trader is available
    function _requireEnoughFreeCollateral(address trader) internal view {
        // P_NEFCI: not enough free collateral by imRatio
        require(_getFreeCollateralByRatio(trader, IPositioningConfig(positioningConfig).getImRatio()) > 0, "P_NEFCI");
    }

    /// @dev this function returns total account value of the trader
    function getAccountValue(address trader) public view returns (int256) {
        return IVaultController(vaultController).getAccountValue(trader);
    }

    /// @dev this function returns total free collateral available of trader
    function _getFreeCollateralByRatio(address trader, uint24 ratio) internal view returns (int256) {
        return IVaultController(vaultController).getFreeCollateralByRatio(trader, ratio);
    }

    function _requirePositioningAdmin() internal view {
        require(hasRole(POSITIONING_ADMIN, _msgSender()), "P_NA"); // Positioning: Not admin
    }

    function _requireSmIntervalRole() internal view {
        require(hasRole(SM_INTERVAL_ROLE, _msgSender()), "Positioning: Not sm interval role");
    }

    function _requireWhitelistLiquidator(address liquidator) internal view {
        require(isLiquidatorWhitelisted[liquidator], "P_LW"); // Positioning: liquidator not whitelisted
    }

    function isChainlinkToken(uint256 baseTokenIndex) internal pure returns (bool) {
        return ((uint256(CHAINLINK_TOKEN_ID & bytes32(baseTokenIndex)) >> 255) == 1) ;
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
}
