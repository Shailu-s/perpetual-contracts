// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change VaultStorageV1. Create a new
/// contract which implements VaultStorageV1 and following the naming convention
/// VaultStorageVX.
abstract contract VaultStorageV1 {
    // --------- IMMUTABLE ---------

    uint8 internal _decimals;

    address internal _settlementToken;

    // --------- ^^^^^^^^^ ---------

    address internal _positioningConfig;
    address internal _accountBalance;
    address internal _Positioning;
    uint256 internal _totalDebt;
    address public _vaultController;
    bool public _isEthVault;

    // key: trader balance
    mapping(address => int256) internal _balance;
}
