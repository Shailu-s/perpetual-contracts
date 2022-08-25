// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import "../tokens/VirtualToken.sol";

contract VirtualTokenTest is VirtualToken {
  function initialize(
    string memory nameArg,
    string memory symbolArg,
    bool isBaseArg
  ) external initializer {
    __VirtualToken_init(nameArg, symbolArg, isBaseArg);
  }

  function beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) external {
      _beforeTokenTransfer(from, to, amount);
  }
}