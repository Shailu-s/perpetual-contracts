// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

interface IIndexPrice {
    /// @notice Returns the index price of the token.
    /// @param index The interval represents sma interval.
    /// @return indexPrice sma price with interval
    function getIndexPrice(uint256 index) external view returns (uint256 indexPrice);
}
