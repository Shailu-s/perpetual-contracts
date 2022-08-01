// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "../interfaces/ITransferManager.sol";
import "../libs/LibFill.sol";
import "./OrderValidator.sol";
import "./AssetMatcher.sol";
import "./TransferExecutor.sol";
import "../helpers/OwnerPausable.sol";

abstract contract MatchingEngineCore is
    Initializable,
    OwnableUpgradeable,
    PausableUpgradeable,
    AssetMatcher,
    TransferExecutor,
    OrderValidator,
    ITransferManager
{
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
        require(_msgSender() == order.trader, "V_PERP_M: not a maker");
        require(order.salt != 0, "V_PERP_M: 0 salt can't be used");
        require(
            order.salt >= makerMinSalt[_msgSender()],
            "V_PERP_M: order salt lower"
        );
        bytes32 orderKeyHash = LibOrder.hashKey(order);
        fills[orderKeyHash] = _UINT256_MAX;
        emit Canceled(
            orderKeyHash,
            order.trader,
            order.isShort ? order.baseAsset.virtualToken : order.quoteAsset.virtualToken,
            order.isShort ? order.baseAsset.value : order.quoteAsset.value,
            order.salt
        );
    }

    function cancelOrdersInBatch(LibOrder.Order[] memory orders) external {
        for (uint256 index = 0; index < orders.length; index++) {
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
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) public whenNotPaused {
        _validateFull(orderLeft, signatureLeft);
        _validateFull(orderRight, signatureRight);
        if (orderLeft.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "V_PERP_M: leftOrder.taker verification failed");
        }
        if (orderRight.trader != address(0)) {
            require(orderRight.trader != orderLeft.trader, "V_PERP_M: rightOrder.taker verification failed");
        }
        _matchAndTransfer(orderLeft, orderRight);
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function _matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal {
        _matchAssets(orderLeft, orderRight);

        LibFill.FillResult memory newFill = _getFillSetNew(orderLeft, orderRight);

        address makeToken = orderLeft.isShort ? orderLeft.baseAsset.virtualToken : orderLeft.quoteAsset.virtualToken;
        address takeToken = orderRight.isShort ? orderRight.baseAsset.virtualToken : orderRight.quoteAsset.virtualToken;

        _doTransfers(
            LibDeal.DealSide(LibAsset.Asset(makeToken, newFill.leftValue), _proxy, orderLeft.trader),
            LibDeal.DealSide(LibAsset.Asset(takeToken, newFill.rightValue), _proxy, orderRight.trader),
            _getDealData(orderLeft, orderRight)
        );

        emit Matched(newFill.rightValue, newFill.leftValue);
    }

    /**
        @notice determines the max amount of fees for the match
        @param feeSide fee side of the match
        @param _protocolFee protocol fee of the match
        @return max fee amount in base points
    */
    function _getMaxFee(LibFeeSide.FeeSide feeSide, uint256 _protocolFee) internal pure returns (uint256) {
        uint256 matchFees = _protocolFee;
        uint256 maxFee;
        
        // TODO: This condition is always true since LibFeeSide.getFeeSide() always returns LibFeeSide.FeeSide.LEFT
        if (feeSide == LibFeeSide.FeeSide.LEFT) {
            maxFee = 1000;
        } else {
            return 0;
        }
        require(maxFee > 0 && maxFee >= matchFees && maxFee <= 1000, "V_PERP_M: wrong maxFee");

        return maxFee;
    }

    function _getDealData(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        view
        returns (LibDeal.DealData memory dealData)
    {
        dealData.protocolFee = _getProtocolFee();
        // TODO: Update code since LibFeeSide.getFeeSide() always returns LibFeeSide.FeeSide.LEFT
        dealData.feeSide = LibFeeSide.getFeeSide(orderLeft, orderRight);
        dealData.maxFeesBasePoint = _getMaxFee(dealData.feeSide, dealData.protocolFee);
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
        matchToken = _matchAssets(orderLeft.baseAsset.virtualToken, orderRight.baseAsset.virtualToken);
        require(matchToken != address(0), "V_PERP_M: make assets don't match");
    }

    function _validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        _validate(order, signature);
    }

    uint256[50] private __gap;
}
