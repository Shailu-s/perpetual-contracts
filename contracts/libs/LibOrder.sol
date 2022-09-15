// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./LibMath.sol";
import "./LibAsset.sol";
import "../interfaces/IVirtualToken.sol";

library LibOrder {
    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(address trader,uint64 deadline,bool isShort,Asset makeAsset,Asset takeAsset,uint256 salt)Asset(address virtualToken,uint256 value)"
        );

    struct Order {
        address trader;
        uint64 deadline;
        bool isShort;
        LibAsset.Asset makeAsset;
        LibAsset.Asset takeAsset;
        uint256 salt;
    }

    function calculateRemaining(Order memory order, uint256 fill)
        internal
        pure
        returns (uint256 baseValue, uint256 quoteValue)
    {
        baseValue = order.makeAsset.value - fill;
        quoteValue = LibMath.safeGetPartialAmountFloor(order.makeAsset.value, order.takeAsset.value, baseValue);
    }

    function hashKey(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(order.trader, LibAsset.hash(order.makeAsset), LibAsset.hash(order.takeAsset), order.salt)
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
                    LibAsset.hash(order.makeAsset),
                    LibAsset.hash(order.takeAsset),
                    order.salt
                )
            );
    }

    function validate(LibOrder.Order memory order) internal view {
        require(order.deadline > block.timestamp, "V_PERP_M: Order deadline validation failed");
        
        bool isMakeAssetBase = IVirtualToken(order.makeAsset.virtualToken).isBase();
        bool isTakeAssetBase = IVirtualToken(order.takeAsset.virtualToken).isBase();

        require(
            (isMakeAssetBase && !isTakeAssetBase) || (!isMakeAssetBase && isTakeAssetBase), 
            "Both makeAsset & takeAsset can't be baseTokens"
        );

        require(
            (order.isShort && isMakeAssetBase && !isTakeAssetBase) ||
            (!order.isShort && !isMakeAssetBase && isTakeAssetBase), 
            "Short order can't have takeAsset as a baseToken/Long order can't have makeAsset as baseToken"
        );
    }
}
