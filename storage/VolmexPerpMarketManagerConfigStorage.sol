// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change VolmexPerpMarketManagerConfigStorageV1. Create a new
/// contract which implements VolmexPerpMarketManagerConfigStorageV1 and following the naming convention
/// VolmexPerpMarketManagerConfigStorageVX.
abstract contract VolmexPerpMarketManagerConfigStorageV1 {
    uint8 internal _maxMarketsPerAccount;
    uint24 internal _imRatio;
    uint24 internal _mmRatio;
    uint24 internal _liquidationPenaltyRatio;
    uint24 internal _partialCloseRatio;
    uint24 internal _maxFundingRate;
    uint32 internal _twapInterval;
    uint256 internal _settlementTokenBalanceCap;
}

abstract contract VolmexPerpMarketManagerConfigStorageV2 is VolmexPerpMarketManagerConfigStorageV1 {
    mapping(address => bool) internal _backstopLiquidityProviderMap;
}
