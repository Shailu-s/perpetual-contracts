// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import "./VirtualToken.sol";
import "../interfaces/IVolmexQuoteToken.sol";

contract VolmexQuoteToken is IVolmexQuoteToken, VirtualToken {
    function initialize(string memory nameArg, string memory symbolArg, bool isBaseArg) external initializer {
        __VirtualToken_init(nameArg, symbolArg, isBaseArg);
    }
}