// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "./LibOrder.sol";
import "../interfaces/IVirtualToken.sol";

library LibFeeSide {
    enum FeeSide {
        LEFT,
        RIGHT,
        NONE
    }

    function getFeeSide(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal view returns (FeeSide) {
        if (!IVirtualToken(orderLeft.makeAsset.virtualToken).isBase()) {
            return FeeSide.LEFT;
        }
        if (!IVirtualToken(orderRight.makeAsset.virtualToken).isBase()) {
            return FeeSide.LEFT;
        }
        return FeeSide.NONE;
    }
}
