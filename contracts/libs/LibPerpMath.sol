// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { FixedPoint96 } from "@uniswap/v3-core/contracts/libraries/FixedPoint96.sol";
import { LibFullMath } from "../libs/LibFullMath.sol";
import { LibSafeCastInt } from "./LibSafeCastInt.sol";
import { LibSafeCastUint } from "./LibSafeCastUint.sol";

library LibPerpMath {
    using LibSafeCastInt for int256;
    using LibSafeCastUint for uint256;

    function formatX96ToX10_18(uint256 valueX96) internal pure returns (uint256) {
        return LibFullMath.mulDiv(valueX96, 1 ether, FixedPoint96.Q96);
    }

    function max(int256 a, int256 b) internal pure returns (int256) {
        return a >= b ? a : b;
    }

    function min(int256 a, int256 b) internal pure returns (int256) {
        return a < b ? a : b;
    }

    function abs(int256 value) internal pure returns (uint256) {
        return value >= 0 ? value.toUint256() : neg256(value).toUint256();
    }

    function neg256(int256 a) internal pure returns (int256) {
        require(a > -2**255, "LibPerpMath: inversion overflow");
        return -a;
    }

    function neg256(uint256 a) internal pure returns (int256) {
        return -LibSafeCastUint.toInt256(a);
    }

    function neg128(int128 a) internal pure returns (int128) {
        require(a > -2**127, "LibPerpMath: inversion overflow");
        return -a;
    }

    function neg128(uint128 a) internal pure returns (int128) {
        return -LibSafeCastUint.toInt128(int128(a));
    }

    function mulRatio(uint256 value, uint24 ratio) internal pure returns (uint256) {
        return LibFullMath.mulDiv(value, ratio, 1e6);
    }

    /// @param denominator cannot be 0 and is checked in LibFullMath.mulDiv()
    function mulDiv(
        int256 a,
        int256 b,
        uint256 denominator
    ) internal pure returns (int256 result) {
        uint256 unsignedA = a < 0 ? uint256(neg256(a)) : uint256(a);
        uint256 unsignedB = b < 0 ? uint256(neg256(b)) : uint256(b);
        bool negative = ((a < 0 && b > 0) || (a > 0 && b < 0)) ? true : false;

        uint256 unsignedResult = LibFullMath.mulDiv(unsignedA, unsignedB, denominator);

        result = negative ? neg256(unsignedResult) : LibSafeCastUint.toInt256(unsignedResult);

        return result;
    }
}
