// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "./LibPart.sol";

library LibOrderData {
    struct Data {
        LibPart.Part[] payouts;
        bool isMakeFill;
    }

    function decodeOrderData(bytes memory data)
        internal
        pure
        returns (Data memory orderData)
    {
        orderData = abi.decode(data, (Data));
    }
}
