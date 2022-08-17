// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IVaultController{

     function initialize(
        address positioningConfig,
        address accountBalanceArg
    ) external;

    function deposit(address token, uint256 amount) external payable;

    function withdraw(address token, uint256 amount) external;

    function registerVault(address _vault, address _token) external;

    function setPositioning(address PositioningArg) external;

    function getAccountValue(address trader)  external view returns (int256);

    function getFreeCollateralByRatio(address trader, uint24 ratio) external view returns (int256);

    function getVault(address _token) external view returns (address);

    function getBalance(address trader) external view returns (int256);
} 