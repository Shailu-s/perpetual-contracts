// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

/// @notice For future upgrades, do not change PositioningStorageV1. Create a new
/// contract which implements PositioningStorageV1 and following the naming convention
/// PositioningStorageVX.
abstract contract PositioningStorageV1 {
    uint256 internal constant _ORACLE_BASE = 1000000;
    uint256 internal constant _ORACLE_BASE_X6 = 1000000;
    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;
    uint256 internal constant _UINT256_MAX = 2**256 - 1;
    bytes32 public constant POSITIONING_ADMIN = keccak256("POSITIONING_ADMIN");
    bytes32 public constant SM_INTERVAL_ROLE = keccak256("SM_INTERVAL_ROLE");
    mapping(address => uint256) internal _firstTradedTimestampMap;
    uint8 internal _settlementTokenDecimals;
    address internal _positioningConfig;
    address internal _vaultController;
    address internal _accountBalance;
    address internal _matchingEngine;
    address internal _marketRegistry;
    uint256 internal _smInterval;
    uint256 internal _smIntervalLiquidation;

    address public defaultFeeReceiver;

    // the last timestamp when funding is settled
    mapping(address => uint256) internal _lastSettledTimestampMap;
    // base token => twPremium
    mapping(address => int256) internal _globalFundingGrowthMap;

    mapping(address => bool) public isLiquidatorWhitelisted;
    bool public isLiquidatorWhitelistEnabled;
    uint256 public indexPriceAllowedInterval;

    uint256[50] private __gap;
}
