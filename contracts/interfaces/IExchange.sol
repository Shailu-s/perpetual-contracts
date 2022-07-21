// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

interface IExchange {
    /// @param amount when closing position, amount(uint256) == takerPositionSize(int256),
    ///        as amount is assigned as takerPositionSize in Positioning.closePosition()
    struct SwapParams {
        address trader;
        address baseToken;
        bool isShort;
        bool isClose;
        uint256 amount;
    }

    struct SwapResponse {
        uint256 base;
        uint256 quote;
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        uint256 fee;
        uint256 insuranceFundFee;
        int256 pnlToBeRealized;
    }

    struct SwapCallbackData {
        address trader;
        address baseToken;
        address pool;
        uint24 uniswapFeeRatio;
        uint256 fee;
    }

    struct RealizePnlParams {
        address trader;
        address baseToken;
        int256 base;
        int256 quote;
    }

    /// @notice Emitted when accountBalance is updated
    /// @param accountBalance The address of accountBalance contract
    event AccountBalanceChanged(address accountBalance);

    /// @notice The actual swap function
    /// @dev can only be called from Positioning
    /// @param params1 The parameters of the swap
    /// @param params2 The parameters of the swap
    /// @return swapResponse The result of the swap
    function swap(SwapParams memory params1, SwapParams memory params2)
        external
        returns (SwapResponse memory swapResponse);

    /// @notice Get the pnl that can be realized if trader reduce position
    /// @dev This function normally won't be needed by traders, but it might be useful for 3rd party
    /// @param params The params needed to do the query, encoded as `RealizePnlParams` in calldata
    /// @return pnlToBeRealized The pnl that can be realized if trader reduce position
    function getPnlToBeRealized(RealizePnlParams memory params) external view returns (int256 pnlToBeRealized);

    /// @notice Get `OrderBook` contract address
    /// @return orderBook `OrderBook` contract address
    function getOrderBook() external view returns (address orderBook);

    /// @notice Get `AccountBalance` contract address
    /// @return accountBalance `AccountBalance` contract address
    function getAccountBalance() external view returns (address accountBalance);

    /// @notice Get `PositioningConfig` contract address
    /// @return Positioning `PositioningConfig` contract address
    function getPositioningConfig() external view returns (address Positioning);
}
