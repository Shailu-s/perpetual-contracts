// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Positioning } from "../orderbook/Positioning.sol";
import "../libs/LibOrder.sol";

contract PositioningTest is Positioning {

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }

    function getAccountValue(address trader) external view returns (int256) {
        return _getAccountValue(trader);
    }

    function registerBaseToken(address trader, address token) external {
        _registerBaseToken(trader, token);
    }
}