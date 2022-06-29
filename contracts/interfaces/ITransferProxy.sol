// SPDX-License-Identifier: BUSL - 1.1

pragma solidity >=0.6.9 <0.8.0;
pragma abicoder v2;

import "../libs/LibAsset.sol";

interface ITransferProxy {
    function transfer(LibAsset.Asset calldata asset, address from, address to) external;
}