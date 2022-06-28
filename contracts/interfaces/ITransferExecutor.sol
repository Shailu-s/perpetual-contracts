// SPDX-License-Identifier: GPL-3.0-or-later

pragma solidity 0.7.6;
pragma abicoder v2;

import { LibAsset } from "../libs/LibAsset.sol";

abstract contract ITransferExecutor {
    function transfer(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) internal virtual;
}
