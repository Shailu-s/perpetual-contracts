// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "../libs/LibOrder.sol";
import "../libs/LibFill.sol";

interface IMatchingEngine {
    function cancelOrder(LibOrder.Order memory order) external;
    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external;
    function cancelAllOrders(uint256 minSalt) external;
    function matchOrders(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) external returns (LibFill.FillResult memory);
    function grantMatchOrders(address account) external;
    function fills(bytes32 orderHashKey) external view returns (uint256);
    function makerMinSalt(address trader) external view returns (uint256);
    function getMaxOrderSizeOverTime(address baseToken) external view returns (uint256 size);
}
