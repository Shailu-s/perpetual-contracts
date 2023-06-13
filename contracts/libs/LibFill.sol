// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "./LibOrder.sol";

library LibFill {
    struct FillResult {
        uint256 leftValue;
        uint256 rightValue;
    }

    struct IsMakeFill {
        bool leftMake;
        bool rightMake;
    }

    /**
     * @dev Should return filled values
     * @param leftOrder left order
     * @param rightOrder right order
     * @param leftOrderFill current fill of the left order (0 if order is unfilled)
     * @param rightOrderFill current fill of the right order (0 if order is unfilled)
     */
    function fillOrder(
        LibOrder.Order memory leftOrder,
        LibOrder.Order memory rightOrder,
        uint256 leftOrderFill,
        uint256 rightOrderFill,
        bool isLeftMakeFill
    ) internal pure returns (FillResult memory) {
        (uint256 leftMakeValue, uint256 leftTakeValue) = LibOrder.calculateRemaining(leftOrder, leftOrderFill, isLeftMakeFill); //q,b
        (uint256 rightMakeValue, uint256 rightTakeValue) = LibOrder.calculateRemaining(rightOrder, rightOrderFill, !isLeftMakeFill); //b,q
        //We have 3 cases here:
        bool isLeftFill = isLeftMakeFill ? rightTakeValue > leftMakeValue : rightMakeValue > leftTakeValue;
        if (isLeftFill) {
            //1nd: left order should be fully filled
            return fillLeft(leftMakeValue, leftTakeValue, rightOrder.makeAsset.value, rightOrder.takeAsset.value, isLeftMakeFill); //lq,lb,rb,rq
        }
        //2st: right order should be fully filled or 3d: both should be fully filled if required values are the same
        return fillRight(leftOrder.makeAsset.value, leftOrder.takeAsset.value, rightMakeValue, rightTakeValue, isLeftMakeFill); //lq,lb,rb,rq
    }

    function fillRight(
        uint256 leftMakeValue,
        uint256 leftTakeValue,
        uint256 rightMakeValue,
        uint256 rightTakeValue,
        bool isLeftMakeFill
    ) internal pure returns (FillResult memory result) {
        uint256 makerQuoteValue;
        if (isLeftMakeFill) { // left is selling EVIV
            makerQuoteValue = LibMath.safeGetPartialAmountFloor(rightTakeValue, leftMakeValue, leftTakeValue);
            require(makerQuoteValue <= rightMakeValue, "fillRight: not enough USD on right");
            return FillResult(rightTakeValue, makerQuoteValue);
        } else { // left is buying EVIV
            uint256 rightUSDNeeded = LibMath.safeGetPartialAmountFloor(rightMakeValue, leftTakeValue, leftMakeValue);
            require(leftMakeValue >= rightUSDNeeded, "fillRight: not enough USD on left");
            return FillResult(rightUSDNeeded, rightMakeValue);
        }
    }

    function fillLeft(
        uint256 leftMakeValue,
        uint256 leftTakeValue,
        uint256 rightMakeValue,
        uint256 rightTakeValue,
        bool isLeftMakeFill
    ) internal pure returns (FillResult memory result) {
        if (isLeftMakeFill) { // left is selling EVIV
            require(rightMakeValue >= leftTakeValue, "fillLeft: not enough USD on right"); // Check if the buyer has enough USD
        } else { // left is buying EVIV
            uint256 rightUSDNeeded = LibMath.safeGetPartialAmountFloor(leftTakeValue, rightMakeValue, rightTakeValue);
            require(leftMakeValue >= rightUSDNeeded, "fillLeft: not enough USD on left"); // Check if the buyer has enough USD
        }
        return FillResult(leftMakeValue, leftTakeValue); // // Settlement will happen according to left order, since left order is seller, therefore leftTakeValue
    }
}
