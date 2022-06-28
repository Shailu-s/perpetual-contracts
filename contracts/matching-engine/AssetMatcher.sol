// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../libs/LibAsset.sol";

abstract contract AssetMatcher is Initializable, OwnableUpgradeable {
    uint256 constant ZERO = 0;

    function matchAssets(LibAsset.Asset memory leftAsset, LibAsset.Asset memory rightAsset)
        internal
        pure
        returns (LibAsset.Asset memory)
    {
        LibAsset.Asset memory result = matchAssetOneSide(leftAsset, rightAsset);
        if (result.virtualToken == address(0)) {
            return matchAssetOneSide(rightAsset, leftAsset);
        } else {
            return result;
        }
    }

    function matchAssetOneSide(LibAsset.Asset memory leftAsset, LibAsset.Asset memory rightAsset)
        private
        pure
        returns (LibAsset.Asset memory)
    {
        address tokenLeft = leftAsset.virtualToken;
        address tokenRight = rightAsset.virtualToken;
        if (tokenLeft != address(0)) {
            if (tokenRight != address(0)) {
                return simpleMatch(leftAsset, rightAsset);
            }
            return LibAsset.Asset(address(0), ZERO);
        }
        revert("not found IAssetMatcher");
    }

    function simpleMatch(LibAsset.Asset memory leftAsset, LibAsset.Asset memory rightAsset)
        private
        pure
        returns (LibAsset.Asset memory)
    {
        bytes32 leftHash = keccak256(abi.encodePacked(leftAsset.virtualToken, leftAsset.value));
        bytes32 rightHash = keccak256(abi.encodePacked(rightAsset.virtualToken, rightAsset.value));
        // TODO .data consists of token address and amount, then how both the hash will be equal
        if (leftHash == rightHash) {
            return leftAsset;
        }
        return LibAsset.Asset(address(0), ZERO);
    }

    uint256[49] private __gap;
}
