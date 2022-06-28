// SPDX-License-Identifier: BUSL - 1.1
pragma solidity 0.7.6;
pragma abicoder v2;

import "./LibAsset.sol";

library LibFeeSide {
    enum FeeSide { NONE, LEFT, RIGHT }

    function getFeeSide(bytes4 leftClass, bytes4 rightClass) internal pure returns (FeeSide) {
        if (leftClass == LibAsset.ERC20_ASSET_CLASS) {
            return FeeSide.LEFT;
        }
        if (rightClass == LibAsset.ERC20_ASSET_CLASS) {
            return FeeSide.RIGHT;
        }
        return FeeSide.NONE;
    }
}