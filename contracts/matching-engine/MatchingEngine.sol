// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "./MatchingEngineCore.sol";

contract MatchingEngine is MatchingEngineCore {
    /**
     * @notice Initialize the contract
     *
     * @param _owner Owner address
     * @param _perpetualOracle Address of mark price oracle
     */
    function initialize(address _owner, IPerpetualOracle _perpetualOracle) public initializer {
        __Context_init_unchained();
        __Pausable_init_unchained();
        perpetualOracle = _perpetualOracle;
        orderSizeInterval = 3600; // Initially set to 1 hour, can be updated later
        _grantRole(MATCHING_ENGINE_CORE_ADMIN, _owner);
    }
}
