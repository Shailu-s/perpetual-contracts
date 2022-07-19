// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;
pragma abicoder v2;

import "./MatchingEngineCore.sol";
import "./TransferManager.sol";

contract MatchingEngine is MatchingEngineCore {
    function __MatchingEngine_init(
        address erc20TransferProxy,
        uint256 newProtocolFee,
        address newDefaultFeeReceiver,
        address owner
    ) public initializer {
        require(newDefaultFeeReceiver != address(0), "V_PERP: zero address");

        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferExecutor_init_unchained(erc20TransferProxy);
        __TransferManager_init_unchained(newProtocolFee, newDefaultFeeReceiver);
        __OrderValidator_init_unchained();
        // __Pausable_init_unchained(); TODO: Remove

        _transferOwnership(owner);
    }
}
