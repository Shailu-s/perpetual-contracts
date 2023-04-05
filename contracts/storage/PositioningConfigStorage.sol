// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

/// @notice For future upgrades, do not change PositioningConfigStorageV1. Create a new
/// contract which implements PositioningConfigStorageV1 and following the naming convention
/// PositioningConfigStorageVX.
abstract contract PositioningConfigStorageV1 {
    bytes32 public constant POSITIONING_CONFIG_ADMIN = keccak256("POSITIONING_CONFIG_ADMIN");
    uint8 internal _maxMarketsPerAccount;
    uint24 internal _imRatio;
    uint24 internal _mmRatio;
    uint24 internal _liquidationPenaltyRatio;
    uint24 internal _partialLiquidationRatio;
    uint24 internal _partialCloseRatio;
    uint24 internal _maxFundingRate;
    uint32 internal _twapInterval;
    uint256 internal _settlementTokenBalanceCap;
    address internal _markPriceOracle;
}
