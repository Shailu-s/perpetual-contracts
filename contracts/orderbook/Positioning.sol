// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
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
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";
import { AccountMarket } from "../libs/AccountMarket.sol";
import { OpenOrder } from "../libs/OpenOrder.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";
import "../libs/LibAsset.sol";
import "../interfaces/IIndexPrice.sol";
import "../interfaces/IBaseToken.sol";
import { FundingRate } from "../funding-rate/FundingRate.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "../libs/LibOrder.sol";
import "../libs/LibFill.sol";
import "../libs/LibDeal.sol";

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

    struct InternalData {
        int256 leftExchangedPositionSize;
        int256 leftExchangedPositionNotional;
        int256 rightExchangedPositionSize;
        int256 rightExchangedPositionNotional;
        int256 leftPositionSize;
        int256 rightPositionSize;
    }

    //
    // MODIFIER
    //
    modifier checkDeadline(uint256 deadline) {
        // transaction expires
        require(_blockTimestamp() <= deadline, "CH_TE");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    /** 
    TODO:   We should change Vault to VaultController here and 
            update with decimals 18 as calculations here are done in 18 decimals
            If not required we should get rid of Exchange contract 
    */
    /// @dev this function is public for testing
    // solhint-disable-next-line func-order
    function initialize(
        address PositioningConfigArg,
        address vaultArg,
        address exchangeArg,
        address accountBalanceArg,
        address matchingEngineArg
    ) public initializer {
        // CH_VANC: Vault address is not contract
        require(vaultArg.isContract(), "CH_VANC");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "CH_CCNC");
        // AccountBalance is not contract
        require(accountBalanceArg.isContract(), "CH_ABNC");
        // CH_ENC: Exchange is not contract
        require(exchangeArg.isContract(), "CH_ENC");
        // CH_MENC: Matching Engine is not contract
        require(matchingEngineArg.isContract(), "CH_MENC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _PositioningConfig = PositioningConfigArg;
        _vault = vaultArg;
        _exchange = exchangeArg;
        _accountBalance = accountBalanceArg;
        _matchingEngine = matchingEngineArg;
        _settlementTokenDecimals = IVault(_vault).decimals();
    }

    /**
    TODO:   Actually we can remove this, it is used in perp-curie to first register trader as trusted entity
    */
    // solhint-disable-next-line func-order
    function setTrustedForwarder(address trustedForwarderArg) external onlyOwner {
        // CH_TFNC: TrustedForwarder is not contract
        require(trustedForwarderArg.isContract(), "CH_TFNC");
        _setTrustedForwarder(trustedForwarderArg);
        emit TrustedForwarderChanged(trustedForwarderArg);
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
        checkDeadline(orderLeft.deadline)
        returns (SwapResponse memory response)
    {
        // register token if it's the first time
        address leftTraderBasetoken;
        address rightTraderBasetoken;
        
        // short = selling base token
        if (orderLeft.isShort) {
            leftTraderBasetoken = orderLeft.makeAsset.virtualToken;
            rightTraderBasetoken = orderRight.takeAsset.virtualToken;
        } else {
            leftTraderBasetoken = orderLeft.takeAsset.virtualToken;
            rightTraderBasetoken = orderRight.makeAsset.virtualToken;
        }

        IAccountBalance(_accountBalance).registerBaseToken(orderLeft.trader, leftTraderBasetoken);
        IAccountBalance(_accountBalance).registerBaseToken(orderRight.trader, rightTraderBasetoken);

        // must settle funding first
        _settleFunding(orderLeft.trader, leftTraderBasetoken);
        _settleFunding(orderRight.trader, rightTraderBasetoken);

        response = _openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            leftTraderBasetoken,
            rightTraderBasetoken
        );
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
        int256 fundingPayment = getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) = IAccountBalance(_accountBalance)
            .getPnlAndPendingFee(trader);
        // solhint-disable-next-line var-name-mixedcase
        int256 balanceX10_18 = SettlementTokenMath.parseSettlementToken(
            IVault(_vault).getBalance(trader),
            _settlementTokenDecimals
        );

        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl + pendingMakerFee
        return balanceX10_18 + (owedRealizedPnl - fundingPayment) + (unrealizedPnl) + (pendingFee.toInt256());
    }

    function _openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight,
        address leftBaseToken,
        address rightBaseToken
    ) internal returns (SwapResponse memory response) {
        /**
        TODO: Matching Engine should update fee return values
         */
        (, , LibFill.FillResult memory newFill, LibDeal.DealData memory dealData) = IMatchingEngine(_matchingEngine)
            .matchOrders(orderLeft, signatureLeft, orderRight, signatureRight);

        // transfer to left trader
        // minting/transferring virtual tokens here
        /**
        TODO: see TODO in VirtualToken.sol as minting is not possible
        This should be either removed or VirtualToken should be changed
         */
        IVirtualToken leftToken = IVirtualToken(orderLeft.takeAsset.virtualToken);
        if (leftToken.balanceOf(orderRight.trader) == 0) {
            leftToken.mint(orderLeft.trader, newFill.rightValue);
        } else if (leftToken.balanceOf(orderRight.trader) >= newFill.rightValue) {
            leftToken.transferFrom(orderRight.trader, orderLeft.trader, newFill.rightValue);
        } else {
            uint256 senderBalance = leftToken.balanceOf(orderRight.trader);
            uint256 restToMint = newFill.rightValue - senderBalance;
            leftToken.transferFrom(orderRight.trader, orderLeft.trader, senderBalance);
            leftToken.mint(orderLeft.trader, restToMint);
        }

        // transfer to right trader
        IVirtualToken rightToken = IVirtualToken(orderRight.takeAsset.virtualToken);
        rightToken.mint(orderRight.trader, newFill.leftValue);
        if (rightToken.balanceOf(orderLeft.trader) == 0) {
            rightToken.mint(orderRight.trader, newFill.leftValue);
        } else if (rightToken.balanceOf(orderLeft.trader) >= newFill.leftValue) {
            rightToken.transferFrom(orderLeft.trader, orderRight.trader, newFill.leftValue);
        } else {
            uint256 senderBalance = rightToken.balanceOf(orderLeft.trader);
            uint256 restToMint = newFill.leftValue - senderBalance;
            rightToken.transferFrom(orderLeft.trader, orderRight.trader, senderBalance);
            rightToken.mint(orderRight.trader, restToMint);
        }

        response = SwapResponse(leftBaseToken, rightBaseToken, newFill, dealData);

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

        // modifies positionSize and openNotional
        IAccountBalance(_accountBalance).modifyTakerBalance(
            orderLeft.trader,
            leftBaseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional
        );

        IAccountBalance(_accountBalance).modifyTakerBalance(
            orderRight.trader,
            rightBaseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional
        );

        if (_firstTradedTimestampMap[leftBaseToken] == 0) {
            _firstTradedTimestampMap[leftBaseToken] = _blockTimestamp();
        }

        if (_firstTradedTimestampMap[rightBaseToken] == 0) {
            _firstTradedTimestampMap[rightBaseToken] = _blockTimestamp();
        }

        // if not closing a position, check margin ratio after swap
        /**
        TODO: no need to fetch it again modifyTakerBalance gives resultant positonSize and openNotional
         */
        internalData.leftPositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(
            orderLeft.trader,
            leftBaseToken
        );
        if (internalData.leftPositionSize != 0) {
            _requireEnoughFreeCollateral(orderLeft.trader);
        }

        internalData.rightPositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(
            orderRight.trader,
            rightBaseToken
        );
        if (internalData.rightPositionSize != 0) {
            _requireEnoughFreeCollateral(orderRight.trader);
        }

        /**
        TODO: no need to fetch it again modifyTakerBalance gives resultant positonSize and openNotional
         */
        int256 leftOpenNotional = IAccountBalance(_accountBalance).getTakerOpenNotional(
            orderLeft.trader,
            leftBaseToken
        );
        int256 rightOpenNotional = IAccountBalance(_accountBalance).getTakerOpenNotional(
            orderRight.trader,
            rightBaseToken
        );

        emit PositionChanged(
            orderLeft.trader,
            leftBaseToken,
            internalData.leftExchangedPositionSize,
            internalData.leftExchangedPositionNotional,
            response.dealData.protocolFee,
            leftOpenNotional
        );

        emit PositionChanged(
            orderRight.trader,
            rightBaseToken,
            internalData.rightExchangedPositionSize,
            internalData.rightExchangedPositionNotional,
            response.dealData.protocolFee,
            rightOpenNotional
        );

        // deregisters if positionSize or openNotional is less than DUST
        IAccountBalance(_accountBalance).deregisterBaseToken(orderLeft.trader, leftBaseToken);
        IAccountBalance(_accountBalance).deregisterBaseToken(orderRight.trader, rightBaseToken);

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

    /**
    TODO: we should remove BaseRelayRecipient
     */
    /// @inheritdoc BaseRelayRecipient
    function _msgSender()
        internal
        view
        override(BaseRelayRecipient, OwnerPausable, ContextUpgradeable)
        returns (address)
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
}
