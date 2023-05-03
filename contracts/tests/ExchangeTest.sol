// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "contracts/oracles/PerpetualOracle.sol";

contract ExchangeTest {
    PerpetualOracle public perpetualOracle;

    function setPerpetualOracle(PerpetualOracle _perpetualOracle) external {
        perpetualOracle = _perpetualOracle;
    }

    function addObservation(uint256 _priceCumulative, uint256 _index) external {
        perpetualOracle.addMarkObservation(_priceCumulative, _index);
    }
}
