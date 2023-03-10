// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../matching-engine/AssetMatcher.sol";

contract AssetMatcherTest is Initializable, AssetMatcher {
    function __AssetMatcherTest_init() external initializer {}

    function matchAssetsTest(address leftBaseToken, address rightBaseToken) external pure returns (address baseToken) {
        return _matchAssets(leftBaseToken, rightBaseToken);
    }
}
