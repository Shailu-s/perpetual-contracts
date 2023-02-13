// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract OwnerPausable is OwnableUpgradeable, PausableUpgradeable {
    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function __OwnerPausable_init() internal onlyInitializing {
        __Ownable_init();
        __Pausable_init();
    }

    function _msgSender() internal view virtual override returns (address) {
        return super._msgSender();
    }

    uint256[50] private __gap;
}
