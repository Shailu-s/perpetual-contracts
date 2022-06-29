// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;

import "./LibMath.sol";
import "./LibAsset.sol";

library LibOrder {
    using SafeMathUpgradeable for uint256;

    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(address maker,Asset makeAsset,address taker,Asset takeAsset,uint256 salt,uint256 deadline,bytes4 dataType,bytes data)Asset(address virtualToken,uint256 value)"
        );

    uint256 constant ON_CHAIN_ORDER = 0;
    bytes4 constant DEFAULT_ORDER_TYPE = 0xffffffff;

    struct Order {
        address maker;
        LibAsset.Asset makeAsset;
        address taker;
        LibAsset.Asset takeAsset;
        uint256 salt;
        uint256 deadline;
        bytes4 dataType;
        bytes data;
    }

    function calculateRemaining(Order memory order, uint256 fill)
        internal
        pure
        returns (uint256 makeValue, uint256 takeValue)
    {
        takeValue = order.takeAsset.value.sub(fill);
        makeValue = LibMath.safeGetPartialAmountFloor(order.makeAsset.value, order.takeAsset.value, takeValue);
    }

    function hashKey(Order memory order) internal pure returns (bytes32) {
        if (order.dataType == DEFAULT_ORDER_TYPE) {
            return
                keccak256(
                    abi.encode(order.maker, LibAsset.hash(order.makeAsset), LibAsset.hash(order.takeAsset), order.salt)
                );
        } else {
            //order.data is in hash for V2, V3 and all new order
            return
                keccak256(
                    abi.encode(
                        order.maker,
                        LibAsset.hash(order.makeAsset),
                        LibAsset.hash(order.takeAsset),
                        order.salt,
                        order.data
                    )
                );
        }
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.maker,
                    LibAsset.hash(order.makeAsset),
                    order.taker,
                    LibAsset.hash(order.takeAsset),
                    order.salt,
                    order.deadline,
                    order.dataType,
                    keccak256(order.data)
                )
            );
    }

    function validate(LibOrder.Order memory order) internal view {
        require(order.deadline > block.timestamp, "Order deadline validation failed");
    }
}
