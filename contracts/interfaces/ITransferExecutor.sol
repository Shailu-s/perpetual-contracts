// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import { LibAsset } from "../libs/LibAsset.sol";

abstract contract ITransferExecutor {
    function transfer(
        LibAsset.Asset memory asset,
        address from,
        address to
    ) internal virtual;
}
