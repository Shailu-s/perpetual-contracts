// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract OwnerPausable is OwnableUpgradeable, PausableUpgradeable {
    // solhint-disable-next-line func-order
    function __OwnerPausable_init() internal initializer {
        __Ownable_init();
        __Pausable_init();
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function _msgSender() internal view virtual override returns (address) {
        return super._msgSender();
    }

    function _msgData() internal view virtual override returns (bytes memory) {
        return super._msgData();
    }

    uint256[50] private __gap;
}
