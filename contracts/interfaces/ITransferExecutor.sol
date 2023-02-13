// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "../libs/LibAsset.sol";

interface ITransferExecutor {
    function transfer(LibAsset.Asset memory asset, address from, address to, address proxy) external;
}
