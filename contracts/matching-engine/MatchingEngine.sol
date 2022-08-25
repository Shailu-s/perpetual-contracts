// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "./MatchingEngineCore.sol";
import "./TransferManager.sol";

contract MatchingEngine is MatchingEngineCore, TransferManager {
    function initialize(
        address erc20TransferProxy,
        address owner
    ) public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferExecutor_init_unchained(erc20TransferProxy);
        __TransferManager_init_unchained();
        __OrderValidator_init_unchained();
        __Pausable_init_unchained();

        _transferOwnership(owner);
    }
}
