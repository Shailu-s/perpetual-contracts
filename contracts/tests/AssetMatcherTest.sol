// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;
pragma abicoder v2;

import "../matching-engine/AssetMatcher.sol";

contract AssetMatcherTest is Initializable, OwnableUpgradeable, AssetMatcher {
    function __AssetMatcherTest_init() external initializer {
        __Ownable_init_unchained();
    }

    function matchAssetsTest(
        LibAsset.Asset calldata leftAsset,
        LibAsset.Asset calldata rightAsset
    ) external pure returns (LibAsset.Asset memory) {
        return matchAssets(leftAsset, rightAsset);
    }
}
