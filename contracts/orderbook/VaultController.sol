// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { BaseRelayRecipient } from "../gsn/BaseRelayRecipient.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { VaultControllerStorage } from "../storage/VaultControllerStorage.sol";
import { IVault } from "../interfaces/IVault.sol";

contract VaultController is ReentrancyGuardUpgradeable, BaseRelayRecipient, OwnerPausable, VaultControllerStorage {
    function initialize() external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();
    }


    function setVault(address _vault, address _token) public {
        _vaultAddress[_token] = _vault;
    }

    function getVault(address _token) public view returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function deposit(address token, uint256 amountX10_D) external {
        address _vault = getVault(token); 
        address from = _msgSender();   
        IVault(_vault).deposit(token, amountX10_D, from);
    }

    function withdraw(address token, uint256 amountX10_D) external {
        address _vault = getVault(token); 
        address to = _msgSender();   
        IVault(_vault).withdraw(token, amountX10_D, to);
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address payable) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }
}
