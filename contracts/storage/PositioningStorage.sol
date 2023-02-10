// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change PositioningStorageV1. Create a new
/// contract which implements PositioningStorageV1 and following the naming convention
/// PositioningStorageVX.
abstract contract PositioningStorageV1 {
    uint256 internal constant _ORACLE_BASE = 100000000;
    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;
    uint256 internal constant _UINT256_MAX = 2**256 - 1;
    bytes32 public constant POSITIONING_ADMIN = keccak256("POSITIONING_ADMIN");
    mapping(address => uint256) internal _firstTradedTimestampMap;
    uint8 internal _settlementTokenDecimals;
    address internal _positioningConfig;
    address internal _vaultController;
    address internal _accountBalance;
    address internal _matchingEngine;
    address internal _marketRegistry;

    address public defaultFeeReceiver;
    mapping(address => bool) public isLiquidatorWhitelist;

    uint256[50] private __gap;
}
