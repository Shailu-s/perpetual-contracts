// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

interface IBaseToken {
    event PriceFeedChanged(address indexed priceFeed);

    function initialize(string memory nameArg, string memory symbolArg, address priceFeedArg, bool isBase) external;
    /// @dev This function is only used for emergency shutdown, to set priceFeed to an emergencyPriceFeed
    function setPriceFeed(address priceFeedArg) external;
    /// @notice Get the current index price
    /// @return indexPrice the current index price
    function getIndexPrice(uint256 index, uint256 twInterval) external view returns (uint256 indexPrice);
    /// @notice Get the price feed address
    /// @return priceFeed the current price feed
    function getPriceFeed() external view returns (address priceFeed);
}
