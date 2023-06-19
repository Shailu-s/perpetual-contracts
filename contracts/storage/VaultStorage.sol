// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

/// @notice For future upgrades, do not change VaultStorageV1. Create a new
/// contract which implements VaultStorageV1 and following the naming convention
/// VaultStorageVX.
abstract contract VaultStorageV1 {
    bytes32 public constant VAULT_ADMIN = keccak256("VAULT_ADMIN");
    uint8 internal _decimals;
    address internal _settlementToken;
    address internal _positioningConfig;
    address internal _accountBalance;
    address internal _positioning;
    uint256 internal _totalDebt;
    address internal _vaultController;
    uint256 public highWeightedAmount; // fat finger amount, used to trigger monitor service for huge deposit and withdraw
}
