// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

/// @dev decimals of settlementToken token MUST be less than 18
library LibSettlementTokenMath {

    // returns number with 18 decimals
    function parseSettlementToken(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        return amount * (10**(18 - decimals));
    }

    // returns number with 18 decimals
    function parseSettlementToken(int256 amount, uint8 decimals) internal pure returns (int256) {
        return amount * (int256(10**(18 - decimals)));
    }

    // returns number with settlementToken's decimals
    function formatSettlementToken(uint256 amount, uint8 decimals) internal pure returns (uint256) {
        return amount / (10**(18 - decimals));
    }

    // returns number with settlementToken's decimals
    function formatSettlementToken(int256 amount, uint8 decimals) internal pure returns (int256) {
        return amount / (int256(10**(18 - decimals)));
    }
}
