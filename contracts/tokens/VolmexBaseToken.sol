// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { ParentToken } from "./base/ParentToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract VolmexBaseToken is ParentToken {
    function getIndexPrice(uint256 index) external view override returns (uint256 answer) {
        (answer, ) = IIndexPriceOracle(_priceFeed).latestRoundData(_twInterval, index);
    }
}
