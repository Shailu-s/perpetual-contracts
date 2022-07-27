// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

abstract contract ITransferExecutor {
    function _transfer(
        address baseToken,
        uint256 amount,
        address from,
        address to
    ) internal virtual;
}
