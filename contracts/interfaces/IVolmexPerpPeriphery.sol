// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../libs/LibOrder.sol";

import "./IPositioning.sol";
import "./IVaultController.sol";

interface IVolmexPerpPeriphery {
    event VaultControllerAdded(uint256 indexed vaultControllerIndex, address indexed vaultController);
    event VaultControllerUpdated(
        uint256 indexed vaultControllerIndex,
        address indexed oldVaultController,
        address indexed newVaultController
    );
    event PositioningAdded(uint256 indexed positioningIndex, address indexed positionings);
    event PositioningUpdated(
        uint256 indexed positioningIndex,
        address indexed oldPositionings,
        address indexed newPositionings
    );
    event RelayerUpdated(address indexed oldRelayerAddress, address indexed newRelayerAddress);

    function depositToVault(
        uint64 _index,
        address _token,
        uint256 _amount
    ) external payable;

    function withdrawFromVault(
        uint64 _index,
        address _token,
        address payable _to,
        uint256 _amount
    ) external;

    function openPosition(
        uint64 _index,
        LibOrder.Order memory _orderLeft,
        bytes memory _signatureLeft,
        LibOrder.Order memory _orderRight,
        bytes memory _signatureRight
    ) external;

    function transferToVault(
        IERC20Upgradeable _token,
        address _from,
        uint256 _amount
    ) external;

    function addPositioning(IPositioning _positioning) external;

    function addVaultController(IVaultController _vaultController) external;

    function updatePositioningAtIndex(
        IPositioning _oldPositioning,
        IPositioning _newPositioning,
        uint256 _index
    ) external;

    function updateVaultControllerAtIndex(
        IVaultController _oldVaultController,
        IVaultController _newVaultController,
        uint256 _index
    ) external;
}
