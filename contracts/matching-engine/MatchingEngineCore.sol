// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../interfaces/ITransferManager.sol";
import "../libs/LibFill.sol";
import "./AssetMatcher.sol";
import "./TransferExecutor.sol";
import "../helpers/OwnerPausable.sol";

abstract contract MatchingEngineCore is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    AssetMatcher,
    TransferExecutor,
    ITransferManager
{
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    mapping(address => uint256) public makerMinSalt;

    //state of the orders
    mapping(bytes32 => uint256) public fills;

    //events
    event Canceled(bytes32 indexed hash, address trader, address baseToken, uint256 amount, uint256 salt);
    event CanceledAll(address indexed trader, uint256 minSalt);
    event Matched(uint256 newLeftFill, uint256 newRightFill);

    function cancelOrder(LibOrder.Order memory order) public {
        require(_msgSender() == order.trader, "V_PERP_M: not a maker");
        require(order.salt != 0, "V_PERP_M: 0 salt can't be used");
        require(order.salt >= makerMinSalt[_msgSender()], "V_PERP_M: order salt lower");
        bytes32 orderKeyHash = LibOrder.hashKey(order);
        fills[orderKeyHash] = _UINT256_MAX;
        emit Canceled(
            orderKeyHash,
            order.trader,
            order.isShort ? order.makeAsset.virtualToken : order.takeAsset.virtualToken,
            order.isShort ? order.makeAsset.value : order.takeAsset.value,
            order.salt
        );
    }

    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external {
        uint256 orderlength = orders.length;
        for (uint256 index = 0; index < orderlength; index++) {
            cancelOrder(orders[index]);
        }
    }

    function cancelAllOrders(uint256 minSalt) external {
        require(minSalt > makerMinSalt[_msgSender()], "V_PERP_M: salt too low");
        makerMinSalt[_msgSender()] = minSalt;

        emit CanceledAll(_msgSender(), minSalt);
    }

    function matchOrders(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight
    )
        public
        whenNotPaused
        returns (
            address,
            address,
            LibFill.FillResult memory
        )
    {
        if (orderLeft.trader != address(0) && orderRight.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "V_PERP_M: order verification failed");
        }
        (LibFill.FillResult memory newFill) = _matchAndTransfer(
            orderLeft,
            orderRight
        );

        return (orderLeft.makeAsset.virtualToken, orderRight.makeAsset.virtualToken, newFill);
    }

    function matchOrderInBatch(
        LibOrder.Order[] memory ordersLeft,
        LibOrder.Order[] memory ordersRight
    ) external whenNotPaused {
        uint256 ordersLength = ordersLeft.length;
        for (uint256 index = 0; index < ordersLength; index++) {
            matchOrders(ordersLeft[index], ordersRight[index]);
        }
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function _matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        returns (LibFill.FillResult memory newFill)
    {
        _matchAssets(orderLeft, orderRight);

        newFill = _getFillSetNew(orderLeft, orderRight);

        address makeToken = orderLeft.isShort ? orderLeft.makeAsset.virtualToken : orderLeft.takeAsset.virtualToken;
        address takeToken = orderRight.isShort ? orderRight.makeAsset.virtualToken : orderRight.takeAsset.virtualToken;

        _doTransfers(
            LibDeal.DealSide(LibAsset.Asset(makeToken, newFill.leftValue), _proxy, orderLeft.trader),
            LibDeal.DealSide(LibAsset.Asset(takeToken, newFill.rightValue), _proxy, orderRight.trader)
        );

        emit Matched(newFill.leftValue, newFill.rightValue);
    }

    /**
        @notice calculates fills for the matched orders and set them in "fills" mapping
        @param orderLeft left order of the match
        @param orderRight right order of the match
        @return returns change in orders' fills by the match 
    */
    function _getFillSetNew(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        returns (LibFill.FillResult memory)
    {
        bytes32 leftOrderKeyHash = LibOrder.hashKey(orderLeft);
        bytes32 rightOrderKeyHash = LibOrder.hashKey(orderRight);
        uint256 leftOrderFill = _getOrderFill(orderLeft.salt, leftOrderKeyHash);
        uint256 rightOrderFill = _getOrderFill(orderRight.salt, rightOrderKeyHash);

        LibFill.FillResult memory newFill = LibFill.fillOrder(orderLeft, orderRight, leftOrderFill, rightOrderFill);

        require(newFill.rightValue > 0 && newFill.leftValue > 0, "V_PERP_M: nothing to fill");

        if (orderLeft.salt != 0) {
            fills[leftOrderKeyHash] = leftOrderFill + newFill.leftValue;
        }

        if (orderRight.salt != 0) {
            fills[rightOrderKeyHash] = rightOrderFill + newFill.rightValue;
        }
        return newFill;
    }

    function _getOrderFill(uint256 salt, bytes32 hash) internal view returns (uint256 fill) {
        if (salt == 0) {
            fill = 0;
        } else {
            fill = fills[hash];
        }
    }

    function _matchAssets(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        pure
        returns (address matchToken)
    {
        matchToken = _matchAssets(orderLeft.makeAsset.virtualToken, orderRight.takeAsset.virtualToken);
        require(matchToken != address(0), "V_PERP_M: left make assets don't match");
        matchToken = _matchAssets(orderLeft.takeAsset.virtualToken, orderRight.makeAsset.virtualToken);
        require(matchToken != address(0), "V_PERP_M: left take assets don't match");
    }
    uint256[50] private __gap;
}
