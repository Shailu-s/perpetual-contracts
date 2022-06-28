// SPDX-License-Identifier: BUSL - 1.1
pragma solidity 0.7.6;
pragma abicoder v2;

import "./LibAsset.sol";

library LibFeeSide {
    enum FeeSide { LEFT }

    function getFeeSide() internal pure returns (FeeSide) {
        return FeeSide.LEFT;
    }
}