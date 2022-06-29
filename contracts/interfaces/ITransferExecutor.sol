// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity =0.8.12;

import { LibAsset } from "../libs/LibAsset.sol";

abstract contract ITransferExecutor {
    function transfer(
        LibAsset.Asset memory asset,
        address from,
        address to
    ) internal virtual;
}
