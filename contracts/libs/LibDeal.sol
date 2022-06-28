// SPDX-License-Identifier: BUSL - 1.1
pragma solidity 0.7.6;
pragma abicoder v2;

import "./LibAsset.sol";
import "./LibPart.sol";
import "./LibFeeSide.sol";

library LibDeal {
    struct DealSide {
        LibAsset.Asset asset;
        LibPart.Part[] payouts;
        LibPart.Part[] originFees;
        address proxy;
        address from;
    }

    struct DealData {
        uint256 protocolFee;
        uint256 maxFeesBasePoint;
        LibFeeSide.FeeSide feeSide;
    }
}
