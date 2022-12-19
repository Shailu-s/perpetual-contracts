// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IPerpFactory {
    event PerpSystemCreated(
        uint256 indexed perpIndex,
        address positioning,
        address vaultController,
        address accountBalance,
        address marketRegistry
    );
    event VaultCreated(address indexed vault, address indexed token);
    event TokenCreated(uint256 indexed tokenIndex, address indexed token);
}
