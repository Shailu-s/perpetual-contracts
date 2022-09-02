// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "../libs/LibDeal.sol";

abstract contract ITransferManager {

    function _doTransfers(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right
    ) internal virtual returns (uint totalMakeValue, uint totalTakeValue);
}