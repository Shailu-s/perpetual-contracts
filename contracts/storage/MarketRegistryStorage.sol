// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change MarketRegistryStorageV1. Create a new
/// contract which implements MarketRegistryStorageV1 and following the naming convention
/// MarketRegistryStorageVX.
abstract contract MarketRegistryStorageV1 {
    address internal _quoteToken;

    uint8 internal _maxOrdersPerMarket;

    // key: baseToken, value: pool
    mapping(address => address) internal _poolMap;

    // key: baseToken, what insurance fund get = exchangeFee * insuranceFundFeeRatio
    mapping(address => uint24) internal _insuranceFundFeeRatioMap;

    mapping(address => uint24) internal _exchangeFeeRatioMap;
}
