// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

library LibAccountMarket {
    /// @param lastTwPremiumGrowthGlobal the last time weighted premiumGrowthGlobalX96
    struct Info {
        int256 takerPositionSize;
        int256 takerOpenNotional;
        int256 lastTwPremiumGrowthGlobal;
    }
}
