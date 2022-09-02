// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import "./RoleManager.sol";

abstract contract PositioningCallee is RoleManager {
    //
    // STATE
    //
    address internal _Positioning;

    //
    // EVENT
    //
    event PositioningCalleeChanged(address indexed PositioningCallee);

    //
    // CONSTRUCTOR
    //

    // solhint-disable-next-line func-order
    function __PositioningCallee_init() internal onlyInitializing {
        _grantRole(POSITIONING_CALLEE_ADMIN, _msgSender());
    }

    function setPositioning(address PositioningArg) external virtual {
        require(hasRole(POSITIONING_CALLEE_ADMIN, _msgSender()), "PositioningCallee: Not admin");
        _Positioning = PositioningArg;
        _grantRole(CAN_MATCH_ORDERS, PositioningArg);
        emit PositioningCalleeChanged(PositioningArg);
    }

    function getPositioning() external view returns (address) {
        return _Positioning;
    }

    function _requireOnlyPositioning() internal view {
        // only Positioning
        require(_msgSender() == _Positioning, "CHD_OCH");
    }

    uint256[50] private __gap;
}
