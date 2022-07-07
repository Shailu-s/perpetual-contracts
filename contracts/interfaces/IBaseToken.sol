// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IBaseToken {
    event PriceFeedChanged(address indexed priceFeed);

    /// @notice Get the price feed address
    /// @return priceFeed the current price feed
    function getPriceFeed() external view returns (address priceFeed);

    /// @notice Get the mark price feed address
    /// @return markPriceFeed the current mark price feed
    function getMarkPriceFeed() external view returns (address markPriceFeed);
}
