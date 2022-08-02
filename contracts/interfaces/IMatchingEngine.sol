// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "../libs/LibOrder.sol";
import "../libs/LibFill.sol";
import "../libs/LibDeal.sol";

interface IMatchingEngine {
    function cancelOrder(LibOrder.Order memory order) external;
    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external;
    function cancelAllOrders(uint256 minSalt) external;
    function matchOrders(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    )
        external
        returns (
            address,
            address,
            LibFill.FillResult memory,
            LibDeal.DealData memory
        );
}
