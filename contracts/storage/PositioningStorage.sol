// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change PositioningStorageV1. Create a new
/// contract which implements PositioningStorageV1 and following the naming convention
/// PositioningStorageVX.
abstract contract PositioningStorageV1 {
    // --------- IMMUTABLE ---------

    // cache the settlement token's decimals for gas optimization
    uint8 internal _settlementTokenDecimals;
    // --------- ^^^^^^^^^ ---------
    mapping(address => uint256) internal _firstTradedTimestampMap;
    address internal _PositioningConfig;
    address internal _vaultController;
    address internal _exchange;
    address internal _accountBalance;
    address internal _matchingEngine;
}
