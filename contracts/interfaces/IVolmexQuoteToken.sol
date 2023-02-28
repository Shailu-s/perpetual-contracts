// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import "./IVirtualToken.sol";

interface IVolmexQuoteToken is IVirtualToken {
    function initialize(string memory nameArg, string memory symbolArg, bool isBaseArg) external;
}
