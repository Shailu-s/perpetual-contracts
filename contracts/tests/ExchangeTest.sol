// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import "contracts/oracles/MarkPriceOracle.sol";

contract ExchangeTest {
    MarkPriceOracle public markPriceOracle;

    function setMarkPriceOracle(MarkPriceOracle _markPriceOracle) external {
        markPriceOracle = _markPriceOracle;
    }

    function addObservation(uint256 _priceCumulative, uint64 _index) external {
        markPriceOracle.addObservation(_priceCumulative, _index);
    }
}
