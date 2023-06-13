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
        if (isLeftMakeFill) {
            makerQuoteValue = LibMath.safeGetPartialAmountFloor(rightTakeValue, leftMakeValue, leftTakeValue); //rq * lb / lq
            require(makerQuoteValue <= rightMakeValue, "V_PERP_M: fillRight: unable to fill");
            return FillResult(rightTakeValue, makerQuoteValue); //rq, lb == left goes long ; rb, lq ==left goes short
        } else {
            makerQuoteValue = LibMath.safeGetPartialAmountFloor(rightMakeValue, leftTakeValue, leftMakeValue);
            require(makerQuoteValue <= leftMakeValue, "V_PERP_M: fillRight: unable to fill");
            return FillResult(makerQuoteValue, rightMakeValue); //rq, lb == left goes long ; rb, lq ==left goes short
        }
    }

    function fillLeft(
        uint256 leftMakeValue,
        uint256 leftTakeValue,
        uint256 rightMakeValue,
        uint256 rightTakeValue,
        bool isLeftMakeFill
    ) internal pure returns (FillResult memory result) {
        if (isLeftMakeFill) {
            uint256 rightTake = LibMath.safeGetPartialAmountFloor(leftTakeValue, rightMakeValue, rightTakeValue); //lb *rq / rb = rq
            require(rightTake <= leftMakeValue, "V_PERP_M: fillLeft: unable to fill");
        } else {
            uint256 rightTake = LibMath.safeGetPartialAmountFloor(leftMakeValue, rightTakeValue, rightMakeValue); //lb *rq / rb = rq
            require(rightTake <= rightMakeValue, "V_PERP_M: fillLeft: unable to fill");
        }
        return FillResult(leftMakeValue, leftTakeValue); //lq,lb
    }
}
