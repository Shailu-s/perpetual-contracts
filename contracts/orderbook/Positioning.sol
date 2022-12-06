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
        // CH_VANC: Vault address is not contract
        require(vaultControllerArg.isContract(), "CH_VANC");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "CH_PCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "CH_ABNC");
        // CH_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "CH_MENC");

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
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight,
        bytes memory liquidator
    ) external override whenNotPaused nonReentrant {

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

        InternalData memory internalData = _openPosition(orderLeft, orderRight, baseToken);
        address positionLiquidator = liquidator.decodeAddress();

        if (_validateOrder(orderLeft, signatureLeft, baseToken)) {
            _takeLiquidationFees(
                orderLeft,
                internalData.leftExchangedPositionNotional,
                internalData.leftExchangedPositionSize,
                baseToken,
                positionLiquidator
            );
        }
        if (_validateOrder(orderRight, signatureRight, baseToken)) {
            _takeLiquidationFees(
                orderRight,
                internalData.rightExchangedPositionNotional,
                internalData.rightExchangedPositionSize,
                baseToken,
                positionLiquidator
            );
        }
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

    function getMaxLiquidationAmount(address trader) public view returns (int256) {
        return IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader) - _getAccountValue(trader);
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
    // INTERNAL NON-VIEW
    //

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

    function registerBaseToken(address trader, address token) external {
        IAccountBalance(_accountBalance).registerBaseToken(trader, token);
    }

    function _takeLiquidationFees(
        LibOrder.Order memory order,
        int256 exchangedPositionNotional,
        int256 exchangedPositionSize,
        address baseToken,
        address liquidator
    ) internal {
        uint256 liquidationFee;
        // trader's pnl-- as liquidation penalty
        liquidationFee = exchangedPositionNotional.abs().mulRatio(
            IPositioningConfig(_positioningConfig).getLiquidationPenaltyRatio()
        );

        //2.5 % liquidation fees to fee receiver
        _modifyOwedRealizedPnl(_getFeeReceiver(), liquidationFee.toInt256());

        //2.5 % liquidation fees to liquidator, increase liquidator's pnl liquidation reward
        _modifyOwedRealizedPnl(liquidator, liquidationFee.toInt256());
        _modifyOwedRealizedPnl(order.trader, (liquidationFee * 2).neg256());

        emit PositionLiquidated(
            order.trader,
            baseToken,
            exchangedPositionNotional.abs(),
            exchangedPositionSize,
            liquidationFee,
            liquidator
        );
    }

    //
    // INTERNAL VIEW
    //

    function _validateOrder(
        LibOrder.Order memory order,
        bytes memory signature,
        address baseToken
    ) internal view returns (bool isLiquidation) {
        LibOrder.validate(order);
        if (_isAccountLiquidatable(order.trader)) {
            _isOrderLiquidatable(order, baseToken);
            return true;
        }
        _validateFull(order, signature);
        return false;
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

    /// @dev this function checks if correct order is received for liquidation
    function _isOrderLiquidatable(LibOrder.Order memory order, address baseToken) internal view {
        int256 positionSize = _getTakerPosition(order.trader, baseToken);

        // P_PSZ: position size is zero
        require(positionSize != 0, "P_PSZ");

        // P_WAP: wrong argument passed
        require(positionSize > 0 == order.isShort, "P_WAP");

        uint24 partialCloseRatio = IPositioningConfig(_positioningConfig).getPartialLiquidationRatio();

        uint256 amount = positionSize.abs().mulRatio(partialCloseRatio);

        int256 maxLiquidation = getMaxLiquidationAmount(order.trader);

        uint256 orderAmount = order.isShort ? order.makeAsset.value : order.takeAsset.value;

        require(orderAmount >= amount && orderAmount <= maxLiquidation.abs(), "P_WTV");
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
        // CH_NEFCI: not enough free collateral by imRatio
        require(_getFreeCollateralByRatio(trader, IPositioningConfig(_positioningConfig).getImRatio()) > 0, "CH_NEFCI");
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
