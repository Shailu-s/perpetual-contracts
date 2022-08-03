// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface IVaultController {

    function initialize(
        address positioningArg,
        address positioningConfig,
        address accountBalanceArg,
        address vaultImplementationArg
    ) external;

    function deployVault(address _token, bool isEthVault) external returns (address);

    function deposit(address token, uint256 amount) external payable;

    function withdraw(address token, uint256 amount) external;

    function getVault(address _token) external view returns (address vault);

    function getAccountValue(address trader) external view returns (int256);
}
