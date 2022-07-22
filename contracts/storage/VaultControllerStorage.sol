// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;


abstract contract VaultControllerStorage {
    
    // key: token of vault
    mapping(address => address) internal _vaultAddress;

    mapping(address => address[]) internal _tradersVaultMap;
    address internal _positioning;
    address internal _accountBalance;
    address internal _vaultImplementation;
    uint8 internal _decimals;

}
