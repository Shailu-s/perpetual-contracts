// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import "../tokens/VirtualToken.sol";

contract VirtualTokenTest is VirtualToken {
  function initialize(
    string memory nameArg,
    string memory symbolArg,
    bool isBase
  ) external initializer {
    __VirtualToken_init(nameArg, symbolArg, isBase);
  }

  function beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) external {
      _beforeTokenTransfer(from, to, amount);
  }
}