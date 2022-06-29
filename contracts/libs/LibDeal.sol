// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "./LibAsset.sol";
import "./LibFeeSide.sol";

library LibDeal {
    struct DealSide {
        LibAsset.Asset asset;
        address proxy;
        address from;
    }

    struct DealData {
        uint256 protocolFee;
        uint256 maxFeesBasePoint;
        LibFeeSide.FeeSide feeSide;
    }
}
