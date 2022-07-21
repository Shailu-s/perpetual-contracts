// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { ParentToken } from "./base/ParentToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract VolmexBaseToken is ParentToken {
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    //
    // EXTERNAL VIEW
    //
    function getIndexPrice(uint256 interval) external view override returns (uint256) {
        (uint256 answer, ) = IIndexPriceOracle(_priceFeed).latestRoundData(interval);
        return _formatDecimals(answer);
    }
}
