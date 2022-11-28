// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;


abstract contract VaultControllerStorage {
    
    // key: token of vault
    mapping(address => address) internal _vaultAddress;

    //mapping from trader to its list of vaults
    mapping(address => address[]) internal _tradersVaultMap;
    address internal _positioning;
    address internal _positioningConfig;
    address internal _accountBalance;

    // trader => (token => balance)
    mapping(address =>  mapping(address => int256)) internal _balance;
}
