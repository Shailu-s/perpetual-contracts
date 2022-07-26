// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "../interfaces/ITransferManager.sol";
import "../libs/LibFill.sol";
import "./OrderValidator.sol";
import "./AssetMatcher.sol";
import "./TransferExecutor.sol";

abstract contract MatchingEngineCore is
    Initializable,
    OwnableUpgradeable,
    AssetMatcher,
    TransferExecutor,
    OrderValidator,
    ITransferManager
{
    using SafeMathUpgradeable for uint256;

    uint256 private constant _UINT256_MAX = 2**256 - 1;

    //state of the orders
    mapping(bytes32 => uint256) public fills;

    //events
    event Canceled(
        bytes32 indexed hash,
        address trader,
        address baseToken,
        uint256 amount,
        uint256 salt
    );
    event CanceledAll(address indexed trader, uint256 minSalt);
    event Matched(uint256 newLeftFill, uint256 newRightFill);

    function cancelOrder(LibOrder.Order memory order) public {
        require(_msgSender() == order.trader, "not a maker");
        require(order.salt != 0, "0 salt can't be used");
        require(
            order.salt >= makerMinSalt[_msgSender()],
            "order salt lower"
        );
        bytes32 orderKeyHash = LibOrder.hashKey(order);
        fills[orderKeyHash] = _UINT256_MAX;
        emit Canceled(
            orderKeyHash,
            order.trader,
            order.baseToken,
            order.amount,
            order.salt
        );
    }

    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external {
        for (uint256 index = 0; index < orders.length; index++) {
            cancelOrder(orders[index]);
        }
    }

    function cancelAllOrders(uint256 minSalt) external {
        require(minSalt > makerMinSalt[_msgSender()], "salt too low");
        makerMinSalt[_msgSender()] = minSalt;

        emit CanceledAll(_msgSender(), minSalt);
    }

    // TODO: matchOrdersInBatch create - refer marketplace-solidity repo
    function matchOrders(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) public {
        validateFull(orderLeft, signatureLeft);
        validateFull(orderRight, signatureRight);
        if (orderLeft.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "leftOrder.taker verification failed");
        }
        if (orderRight.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "rightOrder.taker verification failed");
        }
        matchAndTransfer(orderLeft, orderRight);
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal {
        (address makeMatch, address takeMatch) = matchAssets(orderLeft, orderRight);

        LibFill.FillResult memory newFill = getFillSetNew(orderLeft, orderRight);

        doTransfers(
            LibDeal.DealSide(makeMatch, newFill.leftValue, _proxy, orderLeft.trader),
            LibDeal.DealSide(takeMatch, newFill.rightValue, _proxy, orderRight.trader),
            getDealData()
        );

        emit Matched(newFill.rightValue, newFill.leftValue);
    }

    /**
        @notice determines the max amount of fees for the match
        @param feeSide fee side of the match
        @param _protocolFee protocol fee of the match
        @return max fee amount in base points
    */
    function getMaxFee(LibFeeSide.FeeSide feeSide, uint256 _protocolFee) internal pure returns (uint256) {
        uint256 matchFees = getSumFees(_protocolFee);
        uint256 maxFee;
        
        // TODO: This condition is always true since LibFeeSide.getFeeSide() always returns LibFeeSide.FeeSide.LEFT
        // if (feeSide == LibFeeSide.FeeSide.LEFT) {
        maxFee = 1000;
        // } else {
        //     return 0;
        // }
        // require(maxFee > 0 && maxFee >= matchFees && maxFee <= 1000, "wrong maxFee");

        return maxFee;
    }

    function getDealData()
        internal
        view
        returns (LibDeal.DealData memory dealData)
    {
        dealData.protocolFee = getProtocolFee();
        // TODO: Update code since LibFeeSide.getFeeSide() always returns LibFeeSide.FeeSide.LEFT
        dealData.feeSide = LibFeeSide.getFeeSide();
        dealData.maxFeesBasePoint = getMaxFee(dealData.feeSide, dealData.protocolFee);
    }

    /**
        @notice calculates amount of fees for the match
        @param _protocolFee protocolFee of the match
        @return sum of all fees for the match (protcolFee + leftOrder.originFees + rightOrder.originFees)
     */
    function getSumFees(uint256 _protocolFee) internal pure returns (uint256) {
        //start from protocol fee
        uint256 result = _protocolFee;

        return result;
    }

    /**
        @notice calculates fills for the matched orders and set them in "fills" mapping
        @param orderLeft left order of the match
        @param orderRight right order of the match
        @return returns change in orders' fills by the match 
    */
    function getFillSetNew(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        returns (LibFill.FillResult memory)
    {
        bytes32 leftOrderKeyHash = LibOrder.hashKey(orderLeft);
        bytes32 rightOrderKeyHash = LibOrder.hashKey(orderRight);
        uint256 leftOrderFill = getOrderFill(orderLeft.salt, leftOrderKeyHash);
        uint256 rightOrderFill = getOrderFill(orderRight.salt, rightOrderKeyHash);
        
        LibFill.FillResult memory newFill = LibFill.fillOrder(orderLeft, orderRight, leftOrderFill, rightOrderFill);

        require(newFill.rightValue > 0 && newFill.leftValue > 0, "nothing to fill");

        if (orderLeft.salt != 0) {
            fills[leftOrderKeyHash] = leftOrderFill.add(newFill.leftValue);
        }

        if (orderRight.salt != 0) {
            fills[rightOrderKeyHash] = rightOrderFill.add(newFill.rightValue);
        }
        return newFill;
    }

    function getOrderFill(uint256 salt, bytes32 hash) internal view returns (uint256 fill) {
        if (salt == 0) {
            fill = 0;
        } else {
            fill = fills[hash];
        }
    }

    function matchAssets(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        pure
        returns (address makeMatch, address takeMatch)
    {
        makeMatch = matchAssets(orderLeft.baseToken, orderRight.baseToken);
        require(makeMatch != address(0), "MatchingEngineCore: make assets don't match");
        takeMatch = matchAssets(orderRight.baseToken, orderLeft.baseToken);
        require(takeMatch != address(0), "MatchingEngineCore: take assets don't match");
    }

    function validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        validate(order, signature);
    }

    uint256[47] private __gap;
}
