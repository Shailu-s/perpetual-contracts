// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "./LibMath.sol";
import "./LibAsset.sol";
import "../interfaces/IVirtualToken.sol";

library LibOrder {
    struct Order {
        bytes4 orderType;
        uint64 deadline;
        address trader;
        LibAsset.Asset makeAsset;
        LibAsset.Asset takeAsset;
        uint256 salt;
        uint128 limitOrderTriggerPrice;
        bool isShort;
    }

    bytes32 constant ORDER_TYPEHASH =
        keccak256(
            "Order(bytes4 orderType,uint64 deadline,address trader,Asset makeAsset,Asset takeAsset,uint256 salt,uint128 limitOrderTriggerPrice,bool isShort)Asset(address virtualToken,uint256 value)"
        );

    bytes4 public constant ORDER = 0xf555eb98; // bytes4(keccack256(abi.encodePacked("Order")))
    bytes4 public constant STOP_LOSS_INDEX_PRICE = 0x835d5c1e; // bytes4(keccak256(abi.encodePacked("StopLossIndexPrice")));
    bytes4 public constant STOP_LOSS_LAST_PRICE = 0xd9ed8042; //bytes4(keccak256(abi.encodePacked("StopLossLastPrice")));
    bytes4 public constant STOP_LOSS_MARK_PRICE = 0xe144c7ec; //bytes4(keccak256(abi.encodePacked("StopLossMarkPrice")));
    bytes4 public constant TAKE_PROFIT_INDEX_PRICE = 0x67393efa; //bytes4(keccak256(abi.encodePacked("TakeProfitIndexPrice")));
    bytes4 public constant TAKE_PROFIT_LAST_PRICE = 0xc7dc86f6; //bytes4(keccak256(abi.encodePacked("TakeProfitLastPrice")));
    bytes4 public constant TAKE_PROFIT_MARK_PRICE = 0xb6d64e04; //bytes4(keccak256(abi.encodePacked("TakeProfitMarkPrice")));

    function validate(LibOrder.Order memory order) internal view {
        require(order.deadline > block.timestamp, "V_PERP_M: Order deadline validation failed");

        bool isMakeAssetBase = IVirtualToken(order.makeAsset.virtualToken).isBase();
        bool isTakeAssetBase = IVirtualToken(order.takeAsset.virtualToken).isBase();

        require((isMakeAssetBase && !isTakeAssetBase) || (!isMakeAssetBase && isTakeAssetBase), "Both makeAsset & takeAsset can't be baseTokens");

        require(
            (order.isShort && isMakeAssetBase && !isTakeAssetBase) || (!order.isShort && !isMakeAssetBase && isTakeAssetBase),
            "Short order can't have takeAsset as a baseToken/Long order can't have makeAsset as baseToken"
        );
    }

    function calculateRemaining(Order memory order, uint256 fill) internal pure returns (uint256 baseValue, uint256 quoteValue) {
        baseValue = order.makeAsset.value - fill;
        quoteValue = LibMath.safeGetPartialAmountFloor(order.takeAsset.value, order.makeAsset.value, baseValue);
    }

    function hashKey(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    order.orderType,
                    order.deadline,
                    order.trader,
                    LibAsset.hash(order.makeAsset),
                    LibAsset.hash(order.takeAsset),
                    order.salt,
                    order.limitOrderTriggerPrice,
                    order.isShort
                )
            );
    }

    function hash(Order memory order) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    ORDER_TYPEHASH,
                    order.orderType,
                    order.deadline,
                    order.trader,
                    LibAsset.hash(order.makeAsset),
                    LibAsset.hash(order.takeAsset),
                    order.salt,
                    order.limitOrderTriggerPrice,
                    order.isShort
                )
            );
    }
}
