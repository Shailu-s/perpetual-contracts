// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../libs/LibFill.sol";
import "../interfaces/IPerpetualOracle.sol";
import "../interfaces/IMatchingEngine.sol";
import "./AssetMatcher.sol";

abstract contract MatchingEngineCore is IMatchingEngine, PausableUpgradeable, AssetMatcher, AccessControlUpgradeable {
    struct MaxOrderSizeInfo {
        uint256 value;
        uint256 timestamp;
    }

    uint256 private constant _UINT256_MAX = 2 ** 256 - 1;
    uint256 private constant _ORACLE_BASE = 1000000;
    // admin of matching engine
    bytes32 public constant MATCHING_ENGINE_CORE_ADMIN = keccak256("MATCHING_ENGINE_CORE_ADMIN");
    // match orders role, used in matching engine by Positioning
    bytes32 public constant CAN_MATCH_ORDERS = keccak256("CAN_MATCH_ORDERS");
    // Interfaced address of mark price oracle
    IPerpetualOracle public perpetualOracle;
    // min salt of maker
    mapping(address => uint256) public makerMinSalt;
    //state of the orders
    mapping(bytes32 => uint256) public fills;
    mapping(address => uint256) public orderSizeInitialTimestampCache; // stores initial timestamp of matched order by base token
    mapping(address => MaxOrderSizeInfo) public maxOrderSize; // store max order size and timestamp of that update by base token
    uint256 public orderSizeLookBackWindow; // used to store max order size interval, currently one hour

    //events
    event Canceled(bytes32 indexed hash, address trader, address baseToken, uint256 amount, uint256 salt);
    event CanceledAll(address indexed trader, uint256 minSalt);
    event Matched(address[2] traders, uint64[2] deadline, uint256[2] salt, uint256 newLeftFill, uint256 newRightFill);
    event OrdersFilled(address[2] traders, uint256[2] salts, uint256[2] fills);
    event OrderSizeIntervalUpdated(uint256 interval);

    function grantMatchOrders(address account) external {
        _requireMatchingEngineAdmin();
        _grantRole(CAN_MATCH_ORDERS, account);
    }

    /**
        @notice Cancels multiple orders in batch
        @param orders Array or orders to be cancelled
     */
    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external {
        uint256 orderlength = orders.length;
        for (uint256 index = 0; index < orderlength; index++) {
            cancelOrder(orders[index]);
        }
    }

    /**
        @notice Cancels all orders
        @param minSalt salt in minimum of all orders
     */
    function cancelAllOrders(uint256 minSalt) external {
        require(minSalt > makerMinSalt[_msgSender()], "V_PERP_M: salt too low");
        makerMinSalt[_msgSender()] = minSalt;

        emit CanceledAll(_msgSender(), minSalt);
    }

    function matchOrderInBatch(LibOrder.Order[] memory ordersLeft, LibOrder.Order[] memory ordersRight) external whenNotPaused {
        _requireCanMatchOrders();
        uint256 ordersLength = ordersLeft.length;
        for (uint256 index = 0; index < ordersLength; index++) {
            matchOrders(ordersLeft[index], ordersRight[index]);
        }
    }

    /**
        @notice Cancels a given order
        @param order the order to be cancelled
     */
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

    /** 
        @notice Will match two orders & transfers assets
        @param orderLeft the left side of order
        @param orderRight the right side of order
     */
    function matchOrders(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) public whenNotPaused returns (LibFill.FillResult memory) {
        _requireCanMatchOrders();
        if (orderLeft.trader != address(0) && orderRight.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "V_PERP_M: order verification failed");
            _requireMinSalt(orderLeft.salt, orderLeft.trader);
            _requireMinSalt(orderRight.salt, orderRight.trader);
        }
        LibFill.FillResult memory newFill = _matchAndTransfer(orderLeft, orderRight);

        return (newFill);
    }

    function updateOrderSizeInterval(uint256 _interval) external {
        _requireMatchingEngineAdmin();
        require(_interval >= 600, "MEC_SMI"); // _interval value should not be less than 10 mins
        orderSizeLookBackWindow = _interval;
        emit OrderSizeIntervalUpdated(_interval);
    }

    /// @dev Retrieves the maximum order size amongst all orders that were filled within the last hour
    function getMaxOrderSizeOverTime(address baseToken) external view returns (uint256 size) { /// @dev default order size will be zero
        MaxOrderSizeInfo memory maxOrder = maxOrderSize[baseToken];
        if (
            (block.timestamp - orderSizeInitialTimestampCache[baseToken]) / orderSizeLookBackWindow ==
            (maxOrder.timestamp - orderSizeInitialTimestampCache[baseToken]) / orderSizeLookBackWindow
        ) {
            size = maxOrder.value;
        }
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function _matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal returns (LibFill.FillResult memory newFill) {
        _matchAssets(orderLeft, orderRight);

        newFill = _getFillSetNew(orderLeft, orderRight);

        orderLeft.isShort
            ? _updateObservation(newFill.rightValue, newFill.leftValue, orderLeft.makeAsset.virtualToken)
            : _updateObservation(newFill.leftValue, newFill.rightValue, orderRight.makeAsset.virtualToken);

        bytes32 leftOrderKeyHash = LibOrder.hashKey(orderLeft);
        bytes32 rightOrderKeyHash = LibOrder.hashKey(orderRight);

        emit Matched([orderLeft.trader, orderRight.trader], [orderLeft.deadline, orderRight.deadline], [orderLeft.salt, orderRight.salt], newFill.leftValue, newFill.rightValue);
        emit OrdersFilled([orderLeft.trader, orderRight.trader], [orderLeft.salt, orderRight.salt], [fills[leftOrderKeyHash], fills[rightOrderKeyHash]]);
    }

    function _updateObservation(uint256 quoteValue, uint256 baseValue, address baseToken) internal {
        _updateMaxFill(baseToken, baseValue);
        uint256 index = perpetualOracle.indexByBaseToken(baseToken);
        if (perpetualOracle.initialTimestamps(index) == 0) {
            orderSizeInitialTimestampCache[baseToken] = block.timestamp;
        }
        uint256 price = ((quoteValue * _ORACLE_BASE) / baseValue);
        perpetualOracle.addMarkObservation(index, price);
    }

    function _updateMaxFill(address baseToken, uint256 baseValue) internal {
        uint256 currentTimestamp = block.timestamp;
        MaxOrderSizeInfo memory maxOrder = maxOrderSize[baseToken];
        if (
            (currentTimestamp - orderSizeInitialTimestampCache[baseToken]) / orderSizeLookBackWindow ==
            (maxOrder.timestamp - orderSizeInitialTimestampCache[baseToken]) / orderSizeLookBackWindow
        ) {
            if (maxOrder.value < baseValue) {
                maxOrderSize[baseToken] = MaxOrderSizeInfo({ value: baseValue, timestamp: currentTimestamp });
            }
        } else {
            maxOrderSize[baseToken] = MaxOrderSizeInfo({ value: baseValue, timestamp: currentTimestamp });
        }
    }

    /**
        @notice calculates fills for the matched orders and set them in "fills" mapping
        @param orderLeft left order of the match
        @param orderRight right order of the match
        @return returns change in orders' fills by the match 
    */
    function _getFillSetNew(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal returns (LibFill.FillResult memory) {
        bytes32 leftOrderKeyHash = LibOrder.hashKey(orderLeft);
        bytes32 rightOrderKeyHash = LibOrder.hashKey(orderRight);
        uint256 leftOrderFill = _getOrderFill(orderLeft.salt, leftOrderKeyHash);
        uint256 rightOrderFill = _getOrderFill(orderRight.salt, rightOrderKeyHash);

        LibFill.FillResult memory newFill = LibFill.fillOrder(orderLeft, orderRight, leftOrderFill, rightOrderFill, orderLeft.isShort);
        require(newFill.rightValue > 0 && newFill.leftValue > 0, "V_PERP_M: nothing to fill");

        if (orderLeft.salt != 0) {
            if (orderLeft.isShort) {
                fills[leftOrderKeyHash] = leftOrderFill + newFill.leftValue;
            } else {
                fills[leftOrderKeyHash] = leftOrderFill + newFill.rightValue;
            }
        }

        if (orderRight.salt != 0) {
            if (orderRight.isShort) {
                fills[rightOrderKeyHash] = rightOrderFill + newFill.rightValue;
            } else {
                fills[rightOrderKeyHash] = rightOrderFill + newFill.leftValue;
            }
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

    function _requireMinSalt(uint256 salt, address trader) internal view {
        if (salt != 0) require(salt >= makerMinSalt[trader], "V_PERP_M: Order canceled");
    }

    function _requireCanMatchOrders() internal view {
        // MatchingEngineCore: Not Can Match Orders
        require(hasRole(CAN_MATCH_ORDERS, _msgSender()), "MEC_NCMO");
    }

    function _requireMatchingEngineAdmin() internal view {
        // MatchingEngineCore: Not Can Match Orders
        require(hasRole(MATCHING_ENGINE_CORE_ADMIN, _msgSender()), "MEC_NA");
    }

    function _matchAssets(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal pure returns (address matchToken) {
        matchToken = _matchAssets(orderLeft.makeAsset.virtualToken, orderRight.takeAsset.virtualToken);
        require(matchToken != address(0), "V_PERP_M: left make assets don't match");
        matchToken = _matchAssets(orderLeft.takeAsset.virtualToken, orderRight.makeAsset.virtualToken);
        require(matchToken != address(0), "V_PERP_M: left take assets don't match");
    }

    uint256[50] private __gap;
}
