// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change VaultStorageV1. Create a new
/// contract which implements VaultStorageV1 and following the naming convention
/// VaultStorageVX.
abstract contract VaultStorageV1 {
    // --------- IMMUTABLE ---------

    uint8 internal _decimals;

    address internal _settlementToken;

    // --------- ^^^^^^^^^ ---------

    address internal _PositioningConfig;
    address internal _accountBalance;
    address internal _exchange;
    address internal _Positioning;
    uint256 internal _totalDebt;
    address internal _WETH9;
    address public _vaultController;

    // key: trader, token address
    mapping(address => mapping(address => int256)) internal _balance;
}
