// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

library LibFeeSide {
    // TODO: Remove or not
    enum FeeSide {
        LEFT
    }

    function getFeeSide() internal pure returns (FeeSide) {
        return FeeSide.LEFT;
    }
}
