// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
import "../libs/LibOrder.sol";
import "../libs/LibFill.sol";
import "../libs/LibDeal.sol";

interface IPositioning {
    
    struct MatchResponse {
        LibFill.FillResult newFill;
        LibDeal.DealData dealData;
    }

    struct InternalData {
        int256 leftExchangedPositionSize;
        int256 leftExchangedPositionNotional;
        int256 rightExchangedPositionSize;
        int256 rightExchangedPositionNotional;
        int256 leftPositionSize;
        int256 rightPositionSize;
    }

    /// @notice Emitted when taker position is being liquidated
    /// @param trader The trader who has been liquidated
    /// @param baseToken Virtual base token(ETH, BTC, etc...) address
    /// @param positionNotional The cost of position
    /// @param positionSize The size of position
    /// @param liquidationFee The fee of liquidate
    /// @param liquidator The address of liquidator
    event PositionLiquidated(
        address indexed trader,
        address indexed baseToken,
        uint256 positionNotional,
        int256 positionSize,
        uint256 liquidationFee,
        address liquidator
    );

    // TODO: Implement this event
    /// @notice Emitted when open position with non-zero referral code
    /// @param referralCode The referral code by partners
    event ReferredPositionChanged(bytes32 indexed referralCode);

    /// @notice Emitted when taker's position is being changed
    /// @param trader Trader address
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param exchangedPositionSize The actual amount swap to uniswapV3 pool
    /// @param exchangedPositionNotional The cost of position, include fee
    /// @param fee The fee of open/close position
    /// @param openNotional The cost of open/close position, < 0: long, > 0: short
    event PositionChanged(
        address indexed trader,
        address indexed baseToken,
        int256 exchangedPositionSize,
        int256 exchangedPositionNotional,
        uint256 fee,
        int256 openNotional
    );

    /// @notice Emitted when settling a trader's funding payment
    /// @param trader The address of trader
    /// @param baseToken The address of virtual base token(ETH, BTC, etc...)
    /// @param fundingPayment The fundingPayment of trader on baseToken market, > 0: payment, < 0 : receipt
    event FundingPaymentSettled(address indexed trader, address indexed baseToken, int256 fundingPayment);

    /// @notice Settle all markets fundingPayment to owedRealized Pnl
    /// @param trader The address of trader
    function settleAllFunding(address trader) external;

    /// @notice Trader can call `openPosition` to long/short on baseToken market
    /// @param orderLeft PositionParams struct
    /// @param orderRight PositionParams struct
    function openPosition(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) external returns (MatchResponse memory);

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

    function getAccountValue(address trader) external view returns (int256);
}
