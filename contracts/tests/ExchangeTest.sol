// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "contracts/oracles/MarkPriceOracle.sol";

contract ExchangeTest {
    MarkPriceOracle public markPriceOracle;

    function setMarkPriceOracle(MarkPriceOracle _markPriceOracle) external {
        markPriceOracle = _markPriceOracle;
    }

    function addObservation(uint256 _priceCumulative, uint256 _index) external {
        markPriceOracle.addObservation(_priceCumulative, _index, 0x6c00000000000000000000000000000000000000000000000000000000000000);
    }
}
