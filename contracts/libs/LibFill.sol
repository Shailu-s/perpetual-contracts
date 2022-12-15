// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

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
        uint256 rightOrderFill
    ) internal pure returns (FillResult memory) {
        (uint256 leftBaseValue, uint256 leftQuoteValue) = LibOrder.calculateRemaining(leftOrder, leftOrderFill); //q,b
        (uint256 rightBaseValue, uint256 rightQuoteValue) = LibOrder.calculateRemaining(rightOrder, rightOrderFill); //b,q

        //We have 3 cases here:
        if (rightQuoteValue > leftBaseValue) {
            //1nd: left order should be fully filled
            return fillLeft(leftBaseValue, leftQuoteValue, rightOrder.makeAsset.value, rightOrder.takeAsset.value); //lq,lb,rb,rq
        }
        //2st: right order should be fully filled or 3d: both should be fully filled if required values are the same
        return fillRight(leftOrder.makeAsset.value, leftOrder.takeAsset.value, rightBaseValue, rightQuoteValue); //lq,lb,rb,rq
    }

    function fillRight(
        uint256 leftMakeValue,
        uint256 leftTakeValue,
        uint256 rightMakeValue,
        uint256 rightTakeValue
    ) internal pure returns (FillResult memory result) {
        uint256 makerValue = LibMath.safeGetPartialAmountFloor(rightTakeValue, leftMakeValue, leftTakeValue); //rq * lb / lq
        require(makerValue <= rightMakeValue, "V_PERP_M: fillRight: unable to fill");
        return FillResult(rightTakeValue, makerValue); //rq, lb == left goes long ; rb, lq ==left goes short
    }

    function fillLeft(
        uint256 leftMakeValue,
        uint256 leftTakeValue,
        uint256 rightMakeValue,
        uint256 rightTakeValue
    ) internal pure returns (FillResult memory result) {
        uint256 rightTake = LibMath.safeGetPartialAmountFloor(leftTakeValue, rightMakeValue, rightTakeValue); //lb *rq / rb = rq
        require(rightTake <= leftMakeValue, "V_PERP_M: fillLeft: unable to fill");
        return FillResult(leftMakeValue, leftTakeValue); //lq,lb
    }
}
