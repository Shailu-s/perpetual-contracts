// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "./RoleManager.sol";

abstract contract PositioningCallee is RoleManager {
    // positioning callee admin role
    bytes32 public constant POSITIONING_CALLEE_ADMIN = keccak256("POSITIONING_CALLEE_ADMIN");

    // Address of positioning contracts
    address internal _positioning;

    event PositioningCalleeChanged(address indexed positioningCallee);

    // solhint-disable-next-line func-order
    function __PositioningCallee_init() internal onlyInitializing {
        _grantRole(POSITIONING_CALLEE_ADMIN, _msgSender());
    }

    function setPositioning(address positioningArg) external virtual {
        require(hasRole(POSITIONING_CALLEE_ADMIN, _msgSender()), "PositioningCallee: Not admin");
        _positioning = positioningArg;
        emit PositioningCalleeChanged(positioningArg);
    }

    function getPositioning() external view returns (address) {
        return _positioning;
    }

    function _requireOnlyPositioning() internal view {
        // only Positioning
        require(_msgSender() == _positioning, "CHD_OCH");
    }

    uint256[50] private __gap;
}
