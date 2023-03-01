// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "./MatchingEngineCoreMock.sol";

contract MatchingEngineMock is MatchingEngineCoreMock {
    /**
     * @notice Initialize the contract
     *
     * @param _owner Owner address
     * @param _markPriceOracle Address of mark price oracle
     */
    function initialize(address _owner, IMarkPriceOracle _markPriceOracle) public initializer {
        __Context_init_unchained();
        __Pausable_init_unchained();
        markPriceOracle = _markPriceOracle;
        _grantRole(MATCHING_ENGINE_CORE_ADMIN, _owner);
    }
}
