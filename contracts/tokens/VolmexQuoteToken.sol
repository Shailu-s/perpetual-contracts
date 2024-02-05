// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.18;

import { IQuoteToken } from "../interfaces/IQuoteToken.sol";
import { VirtualToken } from "./VirtualToken.sol";

contract QuoteToken is IQuoteToken, VirtualToken {
    function initialize(
        string memory nameArg,
        string memory symbolArg,
        bool isBaseArg
    ) external initializer {
        __VirtualToken_init(nameArg, symbolArg, isBaseArg);
    }
}
