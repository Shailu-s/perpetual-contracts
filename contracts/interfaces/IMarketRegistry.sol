// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IMarketRegistry {
    struct MarketInfo {
        uint24 exchangeFeeRatio;
        uint24 insuranceFundFeeRatio;
    }

    /// @notice Emitted when the fee ratio of a market is updated.
    /// @param baseToken The address of the base token
    /// @param feeRatio Fee ratio of the market
    event FeeRatioChanged(address baseToken, uint24 feeRatio);

    /// @notice Emitted when the insurance fund fee ratio is updated.
    /// @param feeRatio Insurance fund fee ratio
    event InsuranceFundFeeRatioChanged(uint24 feeRatio);

    /// @notice Emitted when the max orders per market is updated.
    /// @param maxOrdersPerMarket Max orders per market
    event MaxOrdersPerMarketChanged(uint8 maxOrdersPerMarket);

    /// @dev Set the fee ratio for a pool
    /// @param baseToken The token address of the pool.
    /// @param feeRatio The fee ratio for the pool.
    function setFeeRatio(address baseToken, uint24 feeRatio) external;

    /// @dev Set insurance fund fee ratio for a pool
    /// @param baseToken The token address of the pool.
    /// @param insuranceFundFeeRatioArg The fee ratio for the pool.
    function setInsuranceFundFeeRatio(address baseToken, uint24 insuranceFundFeeRatioArg) external;

    /// @dev Set max allowed orders per market
    /// @param maxOrdersPerMarketArg The max allowed orders per market
    function setMaxOrdersPerMarket(uint8 maxOrdersPerMarketArg) external;

    /// @notice Get the fee ratio of a given market
    /// @dev The ratio is in `1e6` format, that means `1% = 1e4`
    /// @param baseToken The address of the base token
    /// @return feeRatio The fee ratio of the market, it is a decimal in `1e6`
    function getFeeRatio(address baseToken) external view returns (uint24 feeRatio);

    /// @notice Get the insurance fund fee ratio of a given market
    /// @dev The ratio is in `1e6` format, that means `1% = 1e4`
    /// @param baseToken The address of the base token
    /// @return feeRatio The fee ratio of the market, it is a decimal in `1e6`
    function getInsuranceFundFeeRatio(address baseToken) external view returns (uint24 feeRatio);

    /// @notice Get the market info by given base token address
    /// @param baseToken The address of the base token
    /// @return info The market info encoded as `MarketInfo`
    function getMarketInfo(address baseToken) external view returns (MarketInfo memory info);

    /// @notice Get the quote token address
    /// @return quoteToken The address of the quote token
    function getQuoteToken() external view returns (address quoteToken);

    /// @notice Get max allowed orders per market
    /// @return maxOrdersPerMarket The max allowed orders per market
    function getMaxOrdersPerMarket() external view returns (uint8 maxOrdersPerMarket);
}
