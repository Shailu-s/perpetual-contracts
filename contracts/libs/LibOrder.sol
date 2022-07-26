// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./LibMath.sol";

library LibOrder {
    using SafeMathUpgradeable for uint256;

    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(address trader,uint256 deadline,bool isShort,bool isMaker,address baseToken,uint256 amount,uint256 salt)"
        );

    struct Order {
        address trader;
        uint64 deadline;
        bool isShort;
        bool isMaker;
        address baseToken;
        uint256 amount;
        uint256 salt;
    }

    function calculateRemaining(Order memory order, uint256 fill)
        internal
        pure
        returns (uint256 value)
    {
        value = order.amount.sub(fill);
    }

    function hashKey(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(order.trader, order.baseToken, order.amount, order.salt)
            );
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
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

    function validate(LibOrder.Order memory order) internal view {
        require(order.deadline > block.timestamp, "Order deadline validation failed");
    }
}
