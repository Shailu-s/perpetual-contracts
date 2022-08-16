// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change MarketRegistryStorageV1. Create a new
/// contract which implements MarketRegistryStorageV1 and following the naming convention
/// MarketRegistryStorageVX.
abstract contract MarketRegistryStorageV1 {
    address internal _quoteToken;

    uint8 internal _maxOrdersPerMarket;

    mapping(address => uint24) internal _exchangeFeeRatioMap;

    address[] internal _baseTokensMarketMap;

    uint24 internal _makerFeeRatio;
    uint24 internal _takerFeeRatio;
}
