// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IERC20TransferProxy {
    function erc20SafeTransferFrom(IERC20Upgradeable token, address from, address to, uint256 value) external;
}
