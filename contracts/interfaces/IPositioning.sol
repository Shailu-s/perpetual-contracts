// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import "../libs/LibOrder.sol";
import "../interfaces/IFundingRate.sol";

interface IPositioning is IFundingRate {
    struct InternalData {
        int256 leftExchangedPositionSize;
        int256 leftExchangedPositionNotional;
        int256 rightExchangedPositionSize;
        int256 rightExchangedPositionNotional;
        int256 leftPositionSize;
        int256 rightPositionSize;
        int256 leftOpenNotional;
        int256 rightOpenNotional;
    }
    struct OrderFees {
        uint256 orderLeftFee;
        uint256 orderRightFee;
    }
    struct RealizePnlParams {
        address trader;
        address baseToken;
        int256 base;
        int256 quote;
    }
    struct InternalRealizePnlParams {
        address trader;
        address baseToken;
        int256 takerPositionSize;
        int256 takerOpenNotional;
        int256 base;
        int256 quote;
    }

    /// @notice Emitted when taker position is being liquidated
    /// @param trader The trader who has been liquidated
    /// @param baseToken Virtual base token(ETH, BTC, etc...) address
    /// @param positionNotional The cost of position
    /// @param positionSize The size of position
    /// @param liquidationFee The fee of liquidate
    /// @param liquidator The address of liquidator
    event PositionLiquidated(address indexed trader, address indexed baseToken, uint256 positionNotional, uint256 positionSize, uint256 liquidationFee, address liquidator);
    /// @notice Emitted when defualt fee receiver is changed
    event DefaultFeeReceiverChanged(address defaultFeeReceiver);
    /// @notice Emitted when taker's position is being changed
    /// @param trader Trader address
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param exchangedPositionSize The actual amount swap to uniswapV3 pool
    /// @param exchangedPositionNotional The cost of position, include fee
    /// @param fee The fee of open/close position
    event PositionChanged(
        address[2] trader,
        address indexed baseToken,
        int256[2] exchangedPositionSize,
        int256[2] exchangedPositionNotional,
        uint256[2] fee,
        bytes4[2] orderType,
        bool[2] isShort
    );
    /// @notice Emitted when settling a trader's funding payment
    /// @param trader The address of trader
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param fundingPayment The fundingPayment of trader on baseToken market, > 0: payment, < 0 : receipt
    event FundingPaymentSettled(address indexed trader, address indexed baseToken, int256 fundingPayment);
    /// @notice Emitted when trusted forwarder address changed
    /// @dev TrustedForward is only used for metaTx
    /// @param forwarder The trusted forwarder address
    event TrustedForwarderChanged(address indexed forwarder);
    /// @notice Emitted when liquidator is whitelisted or removed
    event LiquidatorWhitelisted(address indexed liquidator, bool isWhitelist);
    event FundingPeriodSet(uint256 fundingInterval);

    /// @dev this function is public for testing
    function initialize(
        address positioningConfigArg,
        address vaultControllerArg,
        address accountBalanceArg,
        address matchingEngineArg,
        address perpetualOracleArg,
        address[2] calldata volmexBaseTokenArgs,
        address[2] calldata liquidators
    ) external;

    /// @notice Settle all markets fundingPayment to owedRealized Pnl
    /// @param trader The address of trader
    function settleAllFunding(address trader) external;

    /// @notice Function to set fee receiver
    function setDefaultFeeReceiver(address newDefaultFeeReceiver) external;

    /// @notice Update whitelist for a liquidator
    /// @param isWhitelist if true, whitelist. is false remove whitelist
    function whitelistLiquidator(address liquidator, bool isWhitelist) external;

    /// @notice Update funding rate inteval
    /// @param period should be the funding settlement period
    function setFundingPeriod(uint256 period) external;

    function setSmInterval(uint256 smInterval) external;

    function setSmIntervalLiquidation(uint256 smIntervalLiquidation) external;

    /// @notice If true, allows only whitelisted liquidators, else everyone can be liquidator
    function toggleLiquidatorWhitelist() external;

    /// @notice Trader can call `openPosition` to long/short on baseToken market
    /// @param orderLeft PositionParams struct
    /// @param orderRight PositionParams struct
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight,
        bytes memory liquidator
    ) external;

    /// @notice If trader is underwater, any one can call `liquidate` to liquidate this trader
    /// @dev If trader has open orders, need to call `cancelAllExcessOrders` first
    /// @dev If positionSize is greater than maxLiquidatePositionSize, liquidate maxLiquidatePositionSize by default
    /// @dev If margin ratio >= 0.5 * mmRatio,
    ///         maxLiquidateRatio = MIN((1, 0.5 * totalAbsPositionValue / absPositionValue)
    /// @dev If margin ratio < 0.5 * mmRatio, maxLiquidateRatio = 1
    /// @dev maxLiquidatePositionSize = positionSize * maxLiquidateRatio
    /// @param trader The address of trader
    /// @param baseToken The address of baseToken
    /// @param positionSize the position size to be liquidated by liquidator
    //    and MUST be the same direction as trader's position size
    function liquidate(
        address trader,
        address baseToken,
        int256 positionSize
    ) external;

    /// @notice liquidate trader's position and will liquidate the max possible position size
    /// @dev If margin ratio >= 0.5 * mmRatio,
    /// maxLiquidateRatio = MIN((1, 0.5 * totalAbsPositionValue / absPositionValue)
    /// @dev If margin ratio < 0.5 * mmRatio, maxLiquidateRatio = 1
    /// @dev maxLiquidatePositionSize = positionSize * maxLiquidateRatio
    /// @param trader The address of trader
    /// @param baseToken The address of baseToken
    function liquidateFullPosition(address trader, address baseToken) external;

    /// @notice Get position size of a trader to be liquidated
    /// @param trader The address of trader
    /// @param baseToken The address of baseToken
    function getLiquidatablePosition(address trader, address baseToken) external view returns (uint256);

    /// @notice Get the pnl that can be realized if trader reduce position
    /// @dev This function normally won't be needed by traders, but it might be useful for 3rd party
    /// @param params The params needed to do the query, encoded as `RealizePnlParams` in calldata
    /// @return pnlToBeRealized The pnl that can be realized if trader reduce position
    function getPnlToBeRealized(RealizePnlParams memory params) external view returns (int256 pnlToBeRealized);

    /// @notice Get PositioningConfig address
    /// @return PositioningConfig PositioningConfig address
    function getPositioningConfig() external view returns (address PositioningConfig);

    /// @notice Get total pending funding payment of trader
    /// @param trader address of the trader
    /// @return pendingFundingPayment  total pending funding
    function getAllPendingFundingPayment(address trader) external view returns (int256 pendingFundingPayment);

    /// @notice Get `Vault` address
    /// @return vault `Vault` address
    function getVaultController() external view returns (address vault);

    /// @notice Get AccountBalance address
    /// @return accountBalance `AccountBalance` address
    function getAccountBalance() external view returns (address accountBalance);

    /// @notice Check if order is valid
    /// @param order order
    function getOrderValidate(LibOrder.Order memory order) external view returns (bool);

    function isStaleIndexOracle(address baseToken) external view returns (bool);
}
