// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

library LibAccountMarket {
    struct Info {
        int256 positionSize;
        int256 openNotional;
        int256 lastTwPremiumGrowthGlobal;
    }
}
