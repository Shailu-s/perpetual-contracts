// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IChainlinkIndexPriceOracle } from "../interfaces/IChainlinkIndexPriceOracle.sol";
import { ParentToken } from "./base/ParentToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract ChainlinkBaseToken is ParentToken {
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    //
    // EXTERNAL VIEW
    //
    function getIndexPrice(uint256 interval) external view override returns (uint256) {
        (, int256 answer, , , ) = IChainlinkIndexPriceOracle(_priceFeed).latestRoundData(interval);
        return _formatDecimals(uint256(answer)); // TODO: explicit conversion from int256 to uint256
    }
}
