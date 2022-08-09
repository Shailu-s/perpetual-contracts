// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { AccountMarket } from "../libs/AccountMarket.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { FundingRate } from "../funding-rate/FundingRate.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IIndexPrice } from "../interfaces/IIndexPrice.sol";
import { IBaseToken } from "../interfaces/IBaseToken.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";
import { OpenOrder } from "../libs/OpenOrder.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { PositioningStorageV1 } from "../storage/PositioningStorage.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import "../libs/LibOrder.sol";
import "../libs/LibFill.sol";
import "../libs/LibDeal.sol";
import "../libs/LibAsset.sol";

// TODO : Create bulk match order for perp
// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Positioning is
    IPositioning,
    BlockContext,
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    PositioningStorageV1,
    FundingRate
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

    struct InternalData {
        int256 leftExchangedPositionSize;
        int256 leftExchangedPositionNotional;
        int256 rightExchangedPositionSize;
        int256 rightExchangedPositionNotional;
        int256 leftPositionSize;
        int256 rightPositionSize;
    }

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

        _PositioningConfig = PositioningConfigArg;
        _vaultController = vaultControllerArg;
        _accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        // TODO: Set settlement token
        // _settlementTokenDecimals = 0;
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
    )
        public
        override
        whenNotPaused
        nonReentrant
        returns (MatchResponse memory response)
    {
        address Basetoken;

        // short = selling base token
        if (orderLeft.isShort) {
            Basetoken = orderLeft.makeAsset.virtualToken;
        } else {
            Basetoken = orderLeft.takeAsset.virtualToken;
        }

        // register token if it's the first time
        IAccountBalance(_accountBalance).registerBaseToken(orderLeft.trader, Basetoken);
        IAccountBalance(_accountBalance).registerBaseToken(orderRight.trader, Basetoken);

        // must settle funding first
        _settleFunding(orderLeft.trader, Basetoken);
        _settleFunding(orderRight.trader, Basetoken);

        response = _openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            Basetoken
        );
    }

    function _openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight,
        address BaseToken
    ) internal returns (MatchResponse memory response) {
        /**
        TODO: Matching Engine should update fee return values
         */
        (, , LibFill.FillResult memory newFill, LibDeal.DealData memory dealData) =
            IMatchingEngine(_matchingEngine).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight);

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

        // modifies positionSize and openNotional
        (internalData.leftPositionSize, leftOpenNotional) = IAccountBalance(_accountBalance).modifyTakerBalance(
            orderLeft.trader,
            BaseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional
        );

        (internalData.rightPositionSize, rightOpenNotional) = IAccountBalance(_accountBalance).modifyTakerBalance(
            orderRight.trader,
            BaseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional
        );

        if (_firstTradedTimestampMap[BaseToken] == 0) {
            _firstTradedTimestampMap[BaseToken] = _blockTimestamp();
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
            BaseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional,
            response.dealData.protocolFee,
            leftOpenNotional
        );

        emit PositionChanged(
            orderRight.trader,
            BaseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            response.dealData.protocolFee,
            rightOpenNotional
        );

        return response;
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

    //
    // INTERNAL VIEW
    //
    function _msgSender() internal view override(OwnerPausable, ContextUpgradeable) returns (address) {
        return super._msgSender();
    }

    function _msgData() internal view override(OwnerPausable, ContextUpgradeable) returns (bytes memory) {
        return super._msgData();
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
}
