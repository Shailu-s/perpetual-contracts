// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;

import "contracts/interfaces/IERC20TransferProxy.sol";

contract ERC20TransferProxyTest is IERC20TransferProxy {
    function erc20safeTransferFrom(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 value
    ) external override {
        require(
            token.transferFrom(from, to, value),
            "NFT_IO: failure while transferring"
        );
    }
}
