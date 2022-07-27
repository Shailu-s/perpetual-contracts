// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { SafeOwnable } from "./SafeOwnable.sol";

abstract contract PositioningCallee is SafeOwnable {
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
    function __PositioningCallee_init() internal initializer {
        __SafeOwnable_init();
    }

    function setPositioningCallee(address PositioningArg) external onlyOwner {
        _Positioning = PositioningArg;
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
