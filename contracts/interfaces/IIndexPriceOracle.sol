// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "./IBaseOracle.sol";

interface IIndexPriceOracle is IBaseOracle {
    // Getter  methods
    function latestRoundData(uint256 _twInterval, uint64 _index) external view returns (uint256 answer, uint256 lastUpdateTimestamp);
}
