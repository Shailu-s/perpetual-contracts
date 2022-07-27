// SPDX-License-Identifier: BUSL - 1.1

pragma solidity ^0.8.12;
pragma abicoder v2;

import "../libs/LibOrder.sol";

contract LibOrderTest {
    function validate(LibOrder.Order calldata order) external view {
        LibOrder.validate(order);
    }

    function calculateRemaining(
        LibOrder.Order calldata order,
        uint256 fill
    ) external pure returns (uint256 amount) {
        return LibOrder.calculateRemaining(order, fill);
    }

    function hashKey(LibOrder.Order calldata order) external pure returns (bytes32) {
        return LibOrder.hashKey(order);
    }

    function hash(LibOrder.Order memory order) external pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    LibOrder.ORDER_TYPEHASH,
                    order.trader,
                    order.deadline,
                    order.isShort,
                    order.isMaker,
                    order.baseToken,
                    order.amount,
                    order.salt
                )
            );
    }
}
