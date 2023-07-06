// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

/// @notice For future upgrades, do not change MarketRegistryStorageV1. Create a new
/// contract which implements MarketRegistryStorageV1 and following the naming convention
/// MarketRegistryStorageVX.
abstract contract MarketRegistryStorageV1 {
    // admin of market registry
    bytes32 public constant MARKET_REGISTRY_ADMIN = keccak256("MARKET_REGISTRY_ADMIN");
    address internal _quoteToken;
    uint8 internal _maxOrdersPerMarket;
    address[] internal _baseTokensMarketMap;
    uint24 internal _makerFeeRatio;
    uint24 internal _takerFeeRatio;
    bytes32 public constant ADD_BASE_TOKEN = keccak256("ADD_BASE_TOKEN");
}
