// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;


abstract contract VaultControllerStorage {
    
    // key: token of vault
    mapping(address => address) internal _vaultAddress;

    //mapping from trader to its list of vaults
    mapping(address => address[]) internal _tradersVaultMap;
    address internal _positioning;
    address internal _positioningConfig;
    address internal _accountBalance;
    address internal _vaultImplementation;
}
