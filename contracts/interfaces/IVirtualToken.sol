// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IVirtualToken {
    function isInWhitelist(address account) external view returns (bool);
}
