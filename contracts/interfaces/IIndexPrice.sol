// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

interface IIndexPrice {
    /// @notice Returns the index price of the token.
    /// @param index The interval represents twap interval.
    /// @return indexPrice Twap price with interval
    function getIndexPrice(uint64 index) external view returns (uint256 indexPrice);
}
