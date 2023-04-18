// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.18;
pragma abicoder v2;

import { LibSafeCastInt } from "../../libs/LibSafeCastInt.sol";
import { LibSafeCastUint } from "../../libs/LibSafeCastUint.sol";

contract TestPerpSafeCast {
    using LibSafeCastUint for int256;
    using LibSafeCastInt for uint256;

    // uint test

    function testToUint128(uint256 value) external pure returns (uint128) {
        return value.toUint128();
    }

    function testToUint64(uint256 value) external pure returns (uint64) {
        return value.toUint64();
    }

    function testToUint32(uint256 value) external pure returns (uint32) {
        return value.toUint32();
    }

    function testToUint16(uint256 value) external pure returns (uint16) {
        return value.toUint16();
    }

    function testToUint8(uint256 value) external pure returns (uint8) {
        return value.toUint8();
    }

    // int test

    function testToInt128(int256 value) external pure returns (int128) {
        return value.toInt128();
    }

    function testToInt64(int256 value) external pure returns (int64) {
        return value.toInt64();
    }

    function testToInt32(int256 value) external pure returns (int32) {
        return value.toInt32();
    }

    function testToInt24(int256 value) external pure returns (int24) {
        return value.toInt24();
    }

    function testToInt16(int256 value) external pure returns (int16) {
        return value.toInt16();
    }

    function testToInt8(int256 value) external pure returns (int8) {
        return value.toInt8();
    }
}
