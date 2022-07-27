// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "contracts/interfaces/IERC20TransferProxy.sol";

contract ERC20TransferProxyTest is IERC20TransferProxy {
    function erc20SafeTransferFrom(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 value
    ) external override {
        require(
            token.transferFrom(from, to, value),
            "V_PERP_M: failure while transferring"
        );
    }
}
