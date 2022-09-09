// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "./IVolmexPerpPeriphery.sol";

interface IVaultController{

     function initialize(
        address positioningConfig,
        address accountBalanceArg
    ) external;

    function deposit(IVolmexPerpPeriphery periphery, address token, address from, uint256 amount) external payable;

    function withdraw(address token, address payable to, uint256 amount) external;

    function registerVault(address _vault, address _token) external;

    function setPositioning(address PositioningArg) external;

    function getAccountValue(address trader)  external view returns (int256);

    function getFreeCollateralByRatio(address trader, uint24 ratio) external view returns (int256);

    function getVault(address _token) external view returns (address);

    function getBalance(address trader) external view returns (int256);
} 