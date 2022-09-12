// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
import { VirtualToken } from "../tokens/VirtualToken.sol";

contract QuoteToken is VirtualToken {
    function initialize(string memory nameArg, string memory symbolArg) external initializer {
        __VirtualToken_init(nameArg, symbolArg, false);
    }
}