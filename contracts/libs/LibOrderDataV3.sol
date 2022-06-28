// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

library LibOrderDataV3 {
    bytes4 constant public V3_SELL = bytes4(keccak256("V3_SELL"));
    bytes4 constant public V3_BUY = bytes4(keccak256("V3_BUY"));

    struct DataV3_SELL {
        uint payouts;
        uint originFeeFirst;
        uint originFeeSecond;
        uint maxFeesBasePoint;
    }

    struct DataV3_BUY {
        uint payouts;
        uint originFeeFirst;
        uint originFeeSecond;
    }

    function decodeOrderDataV3_SELL(bytes memory data) internal pure returns (DataV3_SELL memory orderData) {
        orderData = abi.decode(data, (DataV3_SELL));
    }

    function decodeOrderDataV3_BUY(bytes memory data) internal pure returns (DataV3_BUY memory orderData) {
        orderData = abi.decode(data, (DataV3_BUY));
    }

}
