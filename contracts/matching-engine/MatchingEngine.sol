// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "../interfaces/ITransferManager.sol";
import "../libs/LibFill.sol";
import "./OrderValidator.sol";
import "./AssetMatcher.sol";
import "./TransferExecutor.sol";

abstract contract MatchingEngine is
    Initializable,
    OwnableUpgradeable,
    AssetMatcher,
    TransferExecutor,
    OrderValidator,
    ITransferManager
{
    using SafeMathUpgradeable for uint256;

    uint256 private constant UINT256_MAX = 2**256 - 1;

    //state of the orders
    mapping(bytes32 => uint256) public fills;

    //events
    event Cancel(bytes32 hash);
    event Match(uint256 newLeftFill, uint256 newRightFill);

    function cancel(LibOrder.Order memory order) external {
        require(_msgSender() == order.maker, "not a maker");
        require(order.salt != 0, "0 salt can't be used");
        bytes32 orderKeyHash = LibOrder.hashKey(order);
        fills[orderKeyHash] = UINT256_MAX;
        emit Cancel(orderKeyHash);
    }

    function matchOrders(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) external payable {
        validateFull(orderLeft, signatureLeft);
        validateFull(orderRight, signatureRight);
        if (orderLeft.taker != address(0)) {
            require(orderRight.maker == orderLeft.taker, "leftOrder.taker verification failed");
        }
        if (orderRight.taker != address(0)) {
            require(orderRight.taker == orderLeft.maker, "rightOrder.taker verification failed");
        }
        matchAndTransfer(orderLeft, orderRight);
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal {
        (LibAsset.Asset memory makeMatch, LibAsset.Asset memory takeMatch) = matchAssets(orderLeft, orderRight);

        LibFill.FillResult memory newFill = getFillSetNew(orderLeft, orderRight);

        doTransfers(
            LibDeal.DealSide(LibAsset.Asset(makeMatch.virtualToken, newFill.leftValue), _proxy, orderLeft.maker),
            LibDeal.DealSide(LibAsset.Asset(takeMatch.virtualToken, newFill.rightValue), _proxy, orderRight.maker),
            getDealData(orderLeft.dataType, orderRight.dataType)
        );

        emit Match(newFill.rightValue, newFill.leftValue);
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
        if (feeSide == LibFeeSide.FeeSide.LEFT) {
            maxFee = 1000;
        } else {
            return 0;
        }
        require(maxFee > 0 && maxFee >= matchFees && maxFee <= 1000, "wrong maxFee");

        return maxFee;
    }

    function getDealData(bytes4 leftDataType, bytes4 rightDataType)
        internal
        view
        returns (LibDeal.DealData memory dealData)
    {
        dealData.protocolFee = getProtocolFee();
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
        returns (LibAsset.Asset memory makeMatch, LibAsset.Asset memory takeMatch)
    {
        makeMatch = matchAssets(orderLeft.makeAsset, orderRight.takeAsset);
        require(makeMatch.virtualToken != address(0), "assets don't match");
        takeMatch = matchAssets(orderLeft.takeAsset, orderRight.makeAsset);
        require(takeMatch.virtualToken != address(0), "assets don't match");
    }

    function validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        validate(order, signature);
    }

    function getProtocolFee() internal view virtual returns (uint256);

    uint256[47] private __gap;
}
