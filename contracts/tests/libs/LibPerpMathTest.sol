// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;

import { LibPerpMath } from "../../libs/LibPerpMath.sol";

contract TestPerpMath {
    using LibPerpMath for uint160;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibPerpMath for int128;
    using LibPerpMath for uint128;

    function testMax(int256 a, int256 b) external pure returns (int256) {
        return LibPerpMath.max(a, b);
    }

    function testMin(int256 a, int256 b) external pure returns (int256) {
        return LibPerpMath.min(a, b);
    }

    function testAbs(int256 value) external pure returns (uint256) {
        return value.abs();
    }

    function neg128(int128 value) external pure returns (int128) {
        return value.neg128();
    }

    function testMulRatio(uint256 value, uint24 ratio) external pure returns (uint256) {
        return value.mulRatio(ratio);
    }
}
