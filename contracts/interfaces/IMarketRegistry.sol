// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

interface IMarketRegistry {
    /// @notice Emitted when the max orders per market is updated.
    /// @param maxOrdersPerMarket Max orders per market
    event MaxOrdersPerMarketChanged(uint8 maxOrdersPerMarket);

    function initialize(address quoteTokenArg, address[4] calldata volmexBaseTokenArgs) external;

    /// @dev Set max allowed orders per market
    /// @param maxOrdersPerMarketArg The max allowed orders per market
    function setMaxOrdersPerMarket(uint8 maxOrdersPerMarketArg) external;

    /// @dev Set maker fee ratio
    /// @param makerFeeRatio The maker fee ratio
    function setMakerFeeRatio(uint24 makerFeeRatio) external;

    /// @dev Set taker fee ratio
    /// @param takerFeeRatio The taker fee ratio
    function setTakerFeeRatio(uint24 takerFeeRatio) external;

    /// @dev Function to add base token in the market
    /// @param baseToken address of the baseToken
    function addBaseToken(address baseToken) external;

    /// @dev Function to check base token in the market
    /// @param baseToken address of the baseToken
    function checkBaseToken(address baseToken) external returns (bool);

    /// @notice Get the maker fee ration
    function getMakerFeeRatio() external view returns (uint24);

    /// @notice Get the taker fee ration
    function getTakerFeeRatio() external view returns (uint24);

    /// @notice Get the quote token address
    /// @return quoteToken The address of the quote token
    function getQuoteToken() external view returns (address quoteToken);

    /// @notice Get max allowed orders per market
    /// @return maxOrdersPerMarket The max allowed orders per market
    function getMaxOrdersPerMarket() external view returns (uint8 maxOrdersPerMarket);

    function getBaseTokens() external view returns (address[] memory baseTokens);
}
