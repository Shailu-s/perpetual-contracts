// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

/// @notice For future upgrades, do not change ExchangeStorageV1. Create a new
/// contract which implements ExchangeStorageV1 and following the naming convention
/// ExchangeStorageVX.
abstract contract FundingRateStorage {
    int256 internal constant _PRECISION_BASE = 1e18;
    int256 internal constant _IORACLE_BASE = 1e6;
    address internal _perpetualOracleArg;
    uint256 internal _fundingPeriod;
    mapping(address => uint256) internal _lastFundingIndexPrice;
    mapping(address => int256) internal _lastFundingRate;
    mapping(address => uint256) internal _underlyingPriceIndex;

    uint256[50] private __gap;
}
