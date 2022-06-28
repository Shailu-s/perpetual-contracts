// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "../libs/LibAsset.sol";

interface IAssetMatcher {
    function matchAssets(LibAsset.Asset memory leftAsset, LibAsset.Asset memory rightAsset)
        external
        pure
        returns (LibAsset.Asset memory);
}
