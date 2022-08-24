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

    /// @inheritdoc IPositioning
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) public override whenNotPaused nonReentrant returns (MatchResponse memory response) {
        _validateFull(orderLeft, signatureLeft);
        _validateFull(orderRight, signatureRight);
        address baseToken;

        // short = selling base token
        if (orderLeft.isShort) {
            baseToken = orderLeft.makeAsset.virtualToken;
        } else {
            baseToken = orderLeft.takeAsset.virtualToken;
        }

        require(
            IMarketRegistry(_marketRegistry).checkBaseToken(baseToken),
            "V_PERP: Basetoken is not registered in market"
        );

        // must settle funding first
        _settleFunding(orderLeft.trader, baseToken);
        _settleFunding(orderRight.trader, baseToken);

        response = _openPosition(orderLeft, orderRight, baseToken);
    }

    function _openPosition(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight,
        address baseToken
    ) internal returns (MatchResponse memory response) {
        /**
        TODO: Matching Engine should update fee return values
         */
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

        int256 leftOpenNotional;
        int256 rightOpenNotional;
        uint256 orderLeftFee;
        uint256 orderRightFee;
        bool isLeftMaker = true;

        if (isLeftMaker) {
            orderLeftFee = internalData.leftExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getMakerFeeRatio()
            );

            orderRightFee = internalData.rightExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getTakerFeeRatio()
            );
        } else {
            orderLeftFee = internalData.leftExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getTakerFeeRatio()
            );

            orderRightFee = internalData.rightExchangedPositionNotional.abs().mulRatio(
                IMarketRegistry(_marketRegistry).getMakerFeeRatio()
            );
        }

        _modifyOwedRealizedPnl(_getFeeReceiver(), (orderLeftFee + orderRightFee).toInt256());

        // modifies positionSize and openNotional
        (internalData.leftPositionSize, leftOpenNotional) = IAccountBalance(_accountBalance).modifyTakerBalance(
            orderLeft.trader,
            baseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional - orderLeftFee.toInt256()
        );

        (internalData.rightPositionSize, rightOpenNotional) = IAccountBalance(_accountBalance).modifyTakerBalance(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional - orderRightFee.toInt256()
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
            response.dealData.protocolFee,
            leftOpenNotional
        );

        emit PositionChanged(
            orderRight.trader,
            baseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            response.dealData.protocolFee,
            rightOpenNotional
        );

        IAccountBalance(_accountBalance).deregisterBaseToken(orderRight.trader, baseToken);
        IAccountBalance(_accountBalance).deregisterBaseToken(orderLeft.trader, baseToken);

        return response;
    }

    function _validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        _validate(order, signature);
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

    function _isLiquidatable(address trader) internal view returns (bool) {
        return getAccountValue(trader) < IAccountBalance(_accountBalance).getMarginRequirementForLiquidation(trader);
    }

    function _modifyOwedRealizedPnl(address trader, int256 amount) internal {
        IAccountBalance(_accountBalance).modifyOwedRealizedPnl(trader, amount);
    }

    function setDefaultFeeReceiver(address payable newDefaultFeeReceiver) external onlyOwner {
        defaultFeeReceiver = newDefaultFeeReceiver;
    }

    function getAccountValue(address trader) public view override returns (int256) {
        return IVaultController(_vaultController).getAccountValue(trader);
    }

    function _getFeeReceiver() internal view returns (address) {
        return defaultFeeReceiver;
    }

    function _getFreeCollateralByRatio(address trader, uint24 ratio) internal view returns (int256) {
        return IVaultController(_vaultController).getFreeCollateralByRatio(trader, ratio);
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

    function _requireEnoughFreeCollateral(address trader) internal view {
        // CH_NEFCI: not enough free collateral by imRatio
        require(
            _getFreeCollateralByRatio(trader, IPositioningConfig(_PositioningConfig).getImRatio()) >= 0,
            "CH_NEFCI"
        );
    }

    function _msgSender() internal view override(OwnerPausable, ContextUpgradeable) returns (address) {
        return super._msgSender();
    }
}
