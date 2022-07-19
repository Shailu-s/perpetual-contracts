// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;

import "./LibOrder.sol";
import "./LibOrderData.sol";

library LibOrderDataParse {
    function parse(LibOrder.Order memory order)
        internal
        pure
        returns (LibOrderData.Data memory dataOrder)
    {
        if (dataOrder.payouts.length == 0) {
            dataOrder.payouts = payoutSet(order.maker);
        }
    }

    function payoutSet(address orderAddress)
        internal
        pure
        returns (LibPart.Part[] memory)
    {
        LibPart.Part[] memory payout = new LibPart.Part[](1);
        payout[0].account = payable(orderAddress);
        payout[0].value = 10000;
        return payout;
    }
}
