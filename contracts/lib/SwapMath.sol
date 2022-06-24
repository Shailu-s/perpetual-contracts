// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { PerpMath } from "./PerpMath.sol";
import { PerpSafeCast } from "./PerpSafeCast.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

library SwapMath {
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using SafeMathUpgradeable for uint256;

    //
    // CONSTANT
    //

    uint256 internal constant _ONE_HUNDRED_PERCENT = 1e6; // 100%

    //
    // INTERNAL PURE
    //

    function calcAmountScaledByFeeRatio(
        uint256 amount,
        uint24 feeRatio,
        bool isScaledUp
    ) internal pure returns (uint256) {
        // when scaling up, round up to avoid imprecision; it's okay as long as we round down later
        return
            isScaledUp
                ? FullMath.mulDivRoundingUp(amount, _ONE_HUNDRED_PERCENT, uint256(_ONE_HUNDRED_PERCENT).sub(feeRatio))
                : FullMath.mulDiv(amount, uint256(_ONE_HUNDRED_PERCENT).sub(feeRatio), _ONE_HUNDRED_PERCENT);
    }
}
