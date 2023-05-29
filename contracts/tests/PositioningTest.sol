// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { Positioning } from "../orderbook/Positioning.sol";
import "../libs/LibOrder.sol";
import "../interfaces/IMatchingEngine.sol";
import "../interfaces/IAccountBalance.sol";

contract PositioningTest is Positioning {
    function registerBaseToken(address trader, address token) external {
        IAccountBalance(accountBalance).registerBaseToken(trader, token);
    }

    function getTotalAbsPositionValue(address trader) external view returns (uint256) {
        return IAccountBalance(accountBalance).getTotalAbsPositionValue(trader);
    }
}
