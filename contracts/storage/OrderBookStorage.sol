// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Funding } from "../libs/Funding.sol";
import { OpenOrder } from "../libs/OpenOrder.sol";

/// @notice For future upgrades, do not change OrderBookStorageV1. Create a new
/// contract which implements OrderBookStorageV1 and following the naming convention
/// OrderBookStorageVX.
abstract contract OrderBookStorageV1 {
    address internal _exchange;

    // first key: trader, second key: base token
    mapping(address => mapping(address => bytes32[])) internal _openOrderIdsMap;

    // key: openOrderId
    mapping(bytes32 => OpenOrder.Info) internal _openOrderMap;

    // key: base token
    // value: the global accumulator of **quote fee transformed from base fee** of each pool
    mapping(address => uint256) internal _feeGrowthGlobalX128Map;
}
