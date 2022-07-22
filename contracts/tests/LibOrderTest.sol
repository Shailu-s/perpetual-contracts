// SPDX-License-Identifier: MIT

pragma solidity ^0.8.12;
pragma abicoder v2;

import "contracts/libs/LibOrder.sol";

contract LibOrderTest {
    function validate(LibOrder.Order calldata order) external view {
        LibOrder.validate(order);
    }

    function calculateRemaining(
        LibOrder.Order calldata order,
        uint256 fill,
        bool isMakeFill
    ) external pure returns (uint256 amount) {
        return LibOrder.calculateRemaining(order, fill);
    }

    function hashKey(LibOrder.Order calldata order)
        external
        pure
        returns (bytes32)
    {
        return LibOrder.hashKey(order);
    }

    function hash(
        address maker,
        LibAsset.Asset memory makeAsset,
        LibAsset.Asset memory takeAsset,
        uint256 salt,
        bytes memory data
    ) public pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    maker,
                    LibAsset.hash(makeAsset),
                    LibAsset.hash(takeAsset),
                    salt,
                    data
                )
            );
    }
}
