// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import "./IVolmexPerpPeriphery.sol";

interface IVaultController {
    function initialize(address positioningConfig, address accountBalanceArg) external;
    /// @notice Deposit collateral into vault
    /// @param token The address of the token to deposit
    /// @param amount The amount of the token to deposit
    function deposit(IVolmexPerpPeriphery periphery, address token, address from, uint256 amount) external payable;
    /// @notice Withdraw collateral from vault
    /// @param token The address of the token sender is going to withdraw
    /// @param amount The amount of the token to withdraw
    function withdraw(address token, address payable to, uint256 amount) external;
    /// @notice Function to register new vault
    function registerVault(address _vault, address _token) external;
    /// @notice Function to get total account value of a trader
    function getAccountValue(address trader) external view returns (int256);
    /// @notice Function to get total free collateral of a trader by given ratio
    function getFreeCollateralByRatio(address trader, uint24 ratio) external view returns (int256);
    /// @notice Function to get address of the vault related to given token
    function getVault(address _token) external view returns (address);
    /// @notice Function to balance of the trader in 18 Decimals
    function getBalance(address trader) external view returns (int256);
    /// @notice Function to balance of the trader on the basis of token in 18 Decimals
    function getBalanceByToken(address trader, address token) external view returns (int256);
    /// @notice Function to set positioning contract
    function setPositioning(address PositioningArg) external;
}
