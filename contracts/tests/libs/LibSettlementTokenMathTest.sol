// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.18;

import { LibSettlementTokenMath } from "../../libs/LibSettlementTokenMath.sol";

contract TestSettlementTokenMath {
    using LibSettlementTokenMath for uint256;
    using LibSettlementTokenMath for int256;

    function testParseSettlementToken(uint256 amount, uint8 decimals) external pure returns (uint256) {
        return amount.parseSettlementToken(decimals);
    }

    function testParseSettlementToken(int256 amount, uint8 decimals) external pure returns (int256) {
        return amount.parseSettlementToken(decimals);
    }

    function testFormatSettlementToken(uint256 amount, uint8 decimals) external pure returns (uint256) {
        return amount.formatSettlementToken(decimals);
    }

    function testFormatSettlementToken(int256 amount, uint8 decimals) external pure returns (int256) {
        return amount.formatSettlementToken(decimals);
    }
}
