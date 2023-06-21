// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.18;

import { IVolmexQuoteToken } from "../interfaces/IVolmexQuoteToken.sol";
import { VirtualToken } from "./VirtualToken.sol";

contract VolmexQuoteToken is IVolmexQuoteToken, VirtualToken {
    function initialize(
        string memory nameArg,
        string memory symbolArg,
        bool isBaseArg
    ) external initializer {
        __VirtualToken_init(nameArg, symbolArg, isBaseArg);
    }
}
