// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

interface IAssetMatcher {
    function _matchAssets(address leftBaseToken, address rightBaseToken) external pure returns (address baseToken);
}
