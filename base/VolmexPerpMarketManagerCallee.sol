// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { SafeOwnable } from "./SafeOwnable.sol";

abstract contract VolmexPerpMarketManagerCallee is SafeOwnable {
    //
    // STATE
    //
    address internal _volmexPerpMarketManager;

    // __gap is reserved storage
    uint256[50] private __gap;

    //
    // EVENT
    //
    event VolmexPerpMarketManagerCalleeChanged(address indexed volmexPerpMarketManagerCallee);

    //
    // CONSTRUCTOR
    //

    // solhint-disable-next-line func-order
    function __VolmexPerpMarketManagerCallee_init() internal initializer {
        __SafeOwnable_init();
    }

    function setVolmexPerpMarketManagerCallee(address volmexPerpMarketManagerArg) external onlyOwner {
        _volmexPerpMarketManager = volmexPerpMarketManagerArg;
        emit VolmexPerpMarketManagerCalleeChanged(volmexPerpMarketManagerArg);
    }

    function getVolmexPerpMarketManager() external view returns (address) {
        return _volmexPerpMarketManager;
    }

    function _requireOnlyVolmexPerpMarketManager() internal view {
        // only VolmexPerpetual
        require(_msgSender() == _volmexPerpMarketManager, "CHD_OCH");
    }
}
