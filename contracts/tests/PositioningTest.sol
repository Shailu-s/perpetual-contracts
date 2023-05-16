// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { Positioning } from "../orderbook/Positioning.sol";
import "../libs/LibOrder.sol";
import "../interfaces/IMatchingEngine.sol";

contract PositioningTest is Positioning {
    function setMakerMinSalt(uint256 _val) external {
        IMatchingEngine(_matchingEngine).cancelAllOrders(_val);
    }

    function registerBaseToken(address trader, address token) external {
        _registerBaseToken(trader, token);
    }

    function getTotalAbsPositionValue(address trader) external view returns (uint256) {
        return _getTotalAbsPositionValue(trader);
    }
}
