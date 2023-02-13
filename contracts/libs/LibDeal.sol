// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "./LibAsset.sol";

library LibDeal {
    struct DealSide {
        LibAsset.Asset asset;
        address proxy;
        address from;
    }
}
