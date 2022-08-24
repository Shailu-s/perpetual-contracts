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

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IBaseToken } from "../interfaces/IBaseToken.sol";
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

    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address PositioningConfigArg,
        address vaultControllerArg,
        address accountBalanceArg,
        address matchingEngineArg,
        address markPriceArg,
        address indexPriceArg
    ) public initializer {
        // CH_VANC: Vault address is not contract
        require(vaultControllerArg.isContract(), "CH_VANC");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "CH_CCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "CH_ABNC");
        // CH_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "CH_MENC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();
        __FundingRate_init(markPriceArg, indexPriceArg);
        __OrderValidator_init_unchained();

        _PositioningConfig = PositioningConfigArg;
        _vaultController = vaultControllerArg;
        _accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        // TODO: Set settlement token
        // _settlementTokenDecimals = 0;
    }

    function setMarketRegistry(address marketRegistryArg) external onlyOwner {
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
        defaultFeeReceiver = newDefaultFeeReceiver;
    }

    /// @inheritdoc IPositioning
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) public override whenNotPaused nonReentrant returns (MatchResponse memory response) {
        // short = selling base token
        address baseToken = orderLeft.isShort ? orderLeft.makeAsset.virtualToken : orderLeft.takeAsset.virtualToken;

        // register base token for account balance calculations
        IAccountBalance(_accountBalance).registerBaseToken(orderLeft.trader, baseToken);
        IAccountBalance(_accountBalance).registerBaseToken(orderRight.trader, baseToken);

        require(
            IMarketRegistry(_marketRegistry).checkBaseToken(baseToken),
            "V_PERP: Basetoken is not registered in market"
        );

        // must settle funding first
        _settleFunding(orderLeft.trader, baseToken);
        _settleFunding(orderRight.trader, baseToken);

        // check if order is eligible for liquidation
        bool isLeftLiquidation = _isAccountLiquidatable(orderLeft.trader);

        // if order is liquidatable, no need to validate signature of order
        isLeftLiquidation ? _isOrderLiquidatable(orderLeft, baseToken) : _validateFull(orderLeft, signatureLeft);

        bool isRightLiquidation = _isAccountLiquidatable(orderRight.trader);
        isRightLiquidation ? _isOrderLiquidatable(orderRight, baseToken) : _validateFull(orderRight, signatureRight);

        response = _openPosition(orderLeft, orderRight, isLeftLiquidation, isRightLiquidation, baseToken);
    }

    /// @inheritdoc IPositioning
    function getPositioningConfig() public view override returns (address) {
        return _PositioningConfig;
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

    /// @dev this function matches the both orders and opens the position
    function _openPosition(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight,
        bool isLeftLiquidation,
        bool isRightLiquidation,
        address baseToken
    ) internal returns (MatchResponse memory response) {
        (LibFill.FillResult memory newFill, LibDeal.DealData memory dealData) =
            IMatchingEngine(_matchingEngine).matchOrders(orderLeft, orderRight);

        response = MatchResponse(newFill, dealData);

        InternalData memory internalData;
        if (orderLeft.isShort) {
            internalData.leftExchangedPositionSize = response.newFill.leftValue.neg256();
            internalData.rightExchangedPositionSize = response.newFill.leftValue.toInt256();

            internalData.leftExchangedPositionNotional = response.newFill.rightValue.toInt256();
            internalData.rightExchangedPositionNotional = response.newFill.rightValue.neg256();
        } else {
            internalData.leftExchangedPositionSize = response.newFill.rightValue.toInt256();
            internalData.rightExchangedPositionSize = response.newFill.rightValue.neg256();

            internalData.leftExchangedPositionNotional = response.newFill.leftValue.neg256();
            internalData.rightExchangedPositionNotional = response.newFill.leftValue.toInt256();
        }

        uint256 _orderLeftFee;
        uint256 _orderRightFee;
        uint256 liquidationFee;
        address liquidator;

        // TODO: This is hardcoded right now but changes it during relayer development
        bool isLeftMaker = true;

        if (isLeftMaker) {
            _orderLeftFee = internalData.leftExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getMakerFeeRatio()
            );

            _orderRightFee = internalData.rightExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getTakerFeeRatio()
            );
        } else {
            _orderLeftFee = internalData.leftExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getTakerFeeRatio()
            );

            _orderRightFee = internalData.rightExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getMakerFeeRatio()
            );
        }
        // modifies PnL of fee receiver
        _modifyOwedRealizedPnl(_getFeeReceiver(), (_orderLeftFee + _orderRightFee).toInt256());

        // modifies positionSize and openNotional
        (internalData.leftPositionSize, internalData.leftOpenNotional) = IAccountBalance(_accountBalance)
            .modifyTakerBalance(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - _orderLeftFee.toInt256()
        );
        (internalData.rightPositionSize, internalData.rightOpenNotional) = IAccountBalance(_accountBalance)
            .modifyTakerBalance(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - _orderRightFee.toInt256()
        );

        if (_firstTradedTimestampMap[baseToken] == 0) {
            _firstTradedTimestampMap[baseToken] = _blockTimestamp();
        }

        if (isLeftLiquidation) {
            // trader's pnl-- as liquidation penalty
            liquidationFee = internalData.leftExchangedPositionNotional.abs().mulRatio(
                IPositioningConfig(_PositioningConfig).getLiquidationPenaltyRatio()
            );

            //2.5 % liquidation fees to fee receiver
            _modifyOwedRealizedPnl(_getFeeReceiver(), liquidationFee.toInt256());

            //2.5 % liquidation fees to liquidator, increase liquidator's pnl liquidation reward
            liquidator = _msgSender();
            _modifyOwedRealizedPnl(liquidator, liquidationFee.toInt256());

            _modifyOwedRealizedPnl(orderLeft.trader, (liquidationFee * 2).neg256());

            emit PositionLiquidated(
                orderLeft.trader,
                baseToken,
                internalData.leftExchangedPositionNotional.abs(),
                internalData.leftExchangedPositionSize,
                liquidationFee,
                liquidator
            );
        }

        if (isRightLiquidation) {
            // trader's pnl-- as liquidation penalty
            liquidationFee = internalData.rightExchangedPositionNotional.abs().mulRatio(
                IPositioningConfig(_PositioningConfig).getLiquidationPenaltyRatio()
            );

            //2.5 % liquidation fees to fee receiver
            _modifyOwedRealizedPnl(_getFeeReceiver(), liquidationFee.toInt256());

            //2.5 % liquidation fees to liquidator, increase liquidator's pnl liquidation reward
            liquidator = _msgSender();
            _modifyOwedRealizedPnl(liquidator, liquidationFee.toInt256());

            _modifyOwedRealizedPnl(orderRight.trader, (liquidationFee * 2).neg256());

            emit PositionLiquidated(
                orderRight.trader,
                baseToken,
                internalData.rightExchangedPositionNotional.abs(),
                internalData.rightExchangedPositionSize,
                liquidationFee,
                liquidator
            );
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
            response.dealData.protocolFee,
            internalData.leftOpenNotional
        );

        emit PositionChanged(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            response.dealData.protocolFee,
            internalData.rightOpenNotional
        );

        IAccountBalance(_accountBalance).deregisterBaseToken(orderLeft.trader, baseToken);
        IAccountBalance(_accountBalance).deregisterBaseToken(orderRight.trader, baseToken);
        return response;
    }

    //
    // INTERNAL VIEW
    //

    /// @dev this function validate the signature of order
    function _validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        _validate(order, signature);
    }

    /// @dev this function checks if correct order is received for liquidation
    function _isOrderLiquidatable(LibOrder.Order memory order, address baseToken) internal view {
        int256 positionSize = _getTakerPosition(order.trader, baseToken);

        // P_PSZ: position size is zero
        require(positionSize != 0, "P_PSZ");

        // P_WAP: wrong argument passed
        require(positionSize > 0 == order.isShort, "P_WAP");

        uint24 partialCloseRatio = IPositioningConfig(_PositioningConfig).getPartialLiquidationRatio();

        uint256 amount = positionSize.abs().mulRatio(partialCloseRatio);
        order.isShort
            ? require(order.makeAsset.value == amount, "P_WMV")
            : require(order.takeAsset.value == amount, "P_WTV");
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
        require(_getFreeCollateralByRatio(trader, IPositioningConfig(_PositioningConfig).getImRatio()) > 0, "CH_NEFCI");
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
}
