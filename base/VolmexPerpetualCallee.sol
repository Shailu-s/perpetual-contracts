// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeOwnable } from "./SafeOwnable.sol";

abstract contract VolmexPerpetualCallee is SafeOwnable {
    //
    // STATE
    //
    address internal _VolmexPerpetual;

    // __gap is reserved storage
    uint256[50] private __gap;

    //
    // EVENT
    //
    event VolmexPerpetualCalleeChanged(address indexed VolmexPerpetualCallee);

    //
    // CONSTRUCTOR
    //

    // solhint-disable-next-line func-order
    function __VolmexPerpetualCallee_init() internal initializer {
        __SafeOwnable_init();
    }

    function setVolmexPerpetualCallee(address VolmexPerpetualArg) external onlyOwner {
        _VolmexPerpetual = VolmexPerpetualArg;
        emit VolmexPerpetualCalleeChanged(VolmexPerpetualArg);
    }

    function getVolmexPerpetual() external view returns (address) {
        return _VolmexPerpetual;
    }

    function _requireOnlyVolmexPerpetual() internal view {
        // only VolmexPerpetual
        require(_msgSender() == _VolmexPerpetual, "CHD_OCH");
    }
}
