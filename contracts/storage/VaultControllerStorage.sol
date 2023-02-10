// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

abstract contract VaultControllerStorage {
    bytes32 public constant VAULT_CONTROLLER_ADMIN = keccak256("VAULT_CONTROLLER_ADMIN");

    mapping(address => address) internal _vaultAddress;
    mapping(address => address[]) internal _tradersVaultMap;
    address internal _positioning;
    address internal _positioningConfig;
    address internal _accountBalance;
    mapping(address => mapping(address => int256)) internal _balance;
}
