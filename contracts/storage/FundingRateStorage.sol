// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change ExchangeStorageV1. Create a new
/// contract which implements ExchangeStorageV1 and following the naming convention
/// ExchangeStorageVX.
abstract contract FundingRateStorage {
    int256 internal constant _PRECISION_BASE = 1e18;
    address internal _markPriceOracleArg;
    address internal _indexPriceOracleArg;
    uint64 internal _underlyingPriceIndex;

    mapping(address => uint256) internal _lastSettledTimestampMap;
    // mapping basetoken => twpremium(time weighted)
    mapping(address => int256) internal _globalFundingGrowthMap;
    int256 internal _fundingRateInterval;

    uint256[50] private __gap;
}
