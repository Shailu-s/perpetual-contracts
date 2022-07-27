// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

abstract contract AssetMatcher is Initializable, OwnableUpgradeable {
    uint256 constant ZERO = 0;

    function matchAssets(address leftBaseToken, address rightBaseToken)
        internal
        pure
        returns (address baseToken)
    {
        address result = matchAssetOneSide(leftBaseToken, rightBaseToken);
        if (result == address(0)) {
            return matchAssetOneSide(rightBaseToken, leftBaseToken);
        } else {
            return result;
        }
    }

    function matchAssetOneSide(address leftBaseToken, address rightBaseToken)
        private
        pure
        returns (address baseToken)
    {
        if (leftBaseToken != address(0)) {
            if (rightBaseToken != address(0)) {
                return simpleMatch(leftBaseToken, rightBaseToken);
            }
            return address(0);
        }
        revert("AssetMatcher: not found");
    }

    function simpleMatch(address leftBaseToken, address rightBaseToken)
        private
        pure
        returns (address baseToken)
    {
        bytes32 leftHash = keccak256(abi.encodePacked(leftBaseToken));
        bytes32 rightHash = keccak256(abi.encodePacked(rightBaseToken));

        if (leftHash == rightHash) {
            return leftBaseToken;
        }
        return address(0);
    }

    uint256[50] private __gap;
}
