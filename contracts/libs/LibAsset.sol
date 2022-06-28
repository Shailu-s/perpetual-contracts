// SPDX-License-Identifier: BUSL - 1.1
pragma solidity 0.7.6;
pragma abicoder v2;

library LibAsset {
    bytes4 public constant ERC20_ASSET_CLASS = bytes4(keccak256("ERC20"));

    bytes32 constant ASSET_TYPEHASH =
        keccak256("Asset(address virtualToken,uint256 value)");

    struct Asset {
        address virtualToken;
        uint256 value;
    }

    function hash(Asset memory asset) internal pure returns (bytes32) {
        return keccak256(abi.encode(ASSET_TYPEHASH, asset.virtualToken, asset.value));
    }
}