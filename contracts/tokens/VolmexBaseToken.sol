// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { ParentToken } from "./base/ParentToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract VolmexBaseToken is ParentToken {
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    function getIndexPrice(uint64 index) external view override returns (uint256 answer) {
        (answer, ) = IIndexPriceOracle(_priceFeed).latestRoundData(_twInterval, index);
    }
}
