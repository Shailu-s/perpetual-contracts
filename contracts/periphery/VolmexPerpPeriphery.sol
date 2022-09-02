// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../helpers/RoleManager.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVaultController.sol";

contract VolmexPerpPeriphery is Initializable, RoleManager {
    // Save positioning & vaulcontroller
    
    // Used to set the index of positioning
    uint256 public positioningIndex;

    // Used to set the index of vaultController
    uint256 public vaultControllerIndex;

    // Store the addresses of positionings { index => positioning address }
    mapping(uint256 => address) public positionings;

    // Store the addresses of vaultControllers { index => vaultController address }
    mapping(uint256 => address) public vaultControllers;

    /**
     * @notice Initializes the contract
     *
     * @dev Sets the positioning & vaultControllers
     *
     * @param _positioning Array of the positioning contract
     * @param _vaultController Array of the vaultController contract
     */
    function initialize(
        IPositioning[2] memory _positioning,
        IVaultController[2] memory _vaultController,
        address _owner
    ) external initializer {

        for (uint256 i = 0; i < 2; i++) {
            positionings[i] = address(_positioning[i]);
            vaultControllers[i] = address(_vaultController[i]);
        }
        // Since we are adding two addresses, hence updating indexes to 2
        positioningIndex = 2;
        vaultControllerIndex = 2;
        _grantRole(VOLMEX_PERP_PERIPHERY, _owner);
    }

    /**
     * @notice Used to set the Positioning on new index
     *
     * @param _positioning Address of the positioning contract
     */
    function addPositioning(IPositioning _positioning) external {
        _requireVolmexPerpPeripheryAdmin();
        positionings[positioningIndex] = address(_positioning);
        positioningIndex++;
    }

    /**
     * @notice Used to set the VaultController on new index
     *
     * @param _vaultController Address of the vaultController contract
     */
    function addVaultController(IVaultController _vaultController) external {
        _requireVolmexPerpPeripheryAdmin();
        vaultControllers[vaultControllerIndex] = address(_vaultController);
        vaultControllerIndex++;
    }

    /**
        Internal view functions
     */
    function _requireVolmexPerpPeripheryAdmin() internal view {
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "VolmexPerpPeriphery: Not admin");
    }
    
}