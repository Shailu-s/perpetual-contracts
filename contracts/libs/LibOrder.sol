// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./LibMath.sol";
import "./LibAsset.sol";

library LibOrder {
    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(address trader,uint256 deadline,bool isShort,bool isMaker,address baseToken,uint256 amount,uint256 salt)Asset(address virtualToken,uint256 value)"
        );

    struct Order {
        address trader;
        uint64 deadline;
        bool isShort;
        bool isMaker;
        LibAsset.Asset baseAsset;
        LibAsset.Asset quoteAsset;
        uint256 salt;
    }

    function calculateRemaining(Order memory order, uint256 fill)
        internal
        pure
        returns (uint256 baseValue, uint256 quoteValue)
    {
        if (order.isMaker) {
            baseValue = order.baseAsset.value - fill;
            quoteValue = LibMath.safeGetPartialAmountFloor(order.baseAsset.value, order.quoteAsset.value, baseValue);
        } else {
            quoteValue = order.quoteAsset.value - fill;
            baseValue = LibMath.safeGetPartialAmountFloor(order.baseAsset.value, order.quoteAsset.value, quoteValue);
        }
    }

    function hashKey(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(order.trader, LibAsset.hash(order.baseAsset), LibAsset.hash(order.quoteAsset), order.salt)
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
                    order.baseAsset,
                    order.quoteAsset,
                    order.salt
                )
            );
    }

    function validate(LibOrder.Order memory order) internal view {
        require(order.deadline > block.timestamp, "V_PERP_M: Order deadline validation failed");
    }
}
