// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change PositioningConfigStorageV1. Create a new
/// contract which implements PositioningConfigStorageV1 and following the naming convention
/// PositioningConfigStorageVX.
abstract contract PositioningConfigStorageV1 {
    uint8 internal _maxMarketsPerAccount;
    uint24 internal _imRatio;
    uint24 internal _mmRatio;
    uint24 internal _liquidationPenaltyRatio;
    uint24 internal _partialCloseRatio;
    uint24 internal _maxFundingRate;
    uint32 internal _twapInterval;
    uint256 internal _settlementTokenBalanceCap;
}

abstract contract PositioningConfigStorageV2 is PositioningConfigStorageV1 {
    mapping(address => bool) internal _backstopLiquidityProviderMap;
}
