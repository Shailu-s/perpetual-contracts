// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./MatchingEngineCore.sol";
import "./TransferManager.sol";

contract MatchingEngine is MatchingEngineCore, TransferManager {
    function initialize(
        address erc20TransferProxy,
        uint256 newProtocolFee,
        address newDefaultFeeReceiver,
        address owner
    ) public initializer {
        require(newDefaultFeeReceiver != address(0), "V_PERP_M: zero address");

        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferExecutor_init_unchained(erc20TransferProxy);
        __TransferManager_init_unchained(newProtocolFee, newDefaultFeeReceiver);
        __Pausable_init_unchained();

        _transferOwnership(owner);
    }
}
