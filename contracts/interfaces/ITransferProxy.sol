// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "../libs/LibAsset.sol";

interface ITransferProxy {
    function transfer(LibAsset.Asset calldata asset, address from, address to) external;
}
