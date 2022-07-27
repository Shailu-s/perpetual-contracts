// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "../matching-engine/AssetMatcher.sol";

contract AssetMatcherTest is Initializable, OwnableUpgradeable, AssetMatcher {
    function __AssetMatcherTest_init() external initializer {
        __Ownable_init_unchained();
    }

    function matchAssetsTest(
        address leftBaseToken,
        address rightBaseToken
    ) external pure returns (address baseToken) {
        return _matchAssets(leftBaseToken, rightBaseToken);
    }
}
