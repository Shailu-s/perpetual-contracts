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
    address internal _positioningConfig;
    address internal _vaultController;
    address internal _accountBalance;
    address internal _matchingEngine;
    address internal _marketRegistry;

    address public defaultFeeReceiver;
    mapping(address => bool) internal _isLiquidatorWhitelist;

    uint256[50] private __gap;
}
