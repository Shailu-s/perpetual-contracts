// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./MatchingEngineCore.sol";
import "./TransferManager.sol";

contract MatchingEngine is MatchingEngineCore, TransferManager {
    /**
     * @notice Initialize the contract
     *
     * @param _erc20TransferProxy Address of ERC20TransferProxy
     * @param _owner Owner address
     * @param _markPriceOracle Address of mark price oracle
     */
    function initialize(
        address _erc20TransferProxy,
        address _owner,
        IMarkPriceOracle _markPriceOracle
    ) public initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferExecutor_init_unchained(_erc20TransferProxy);
        __TransferManager_init_unchained();
        __Pausable_init_unchained();
        markPriceOracle = _markPriceOracle;

        _transferOwnership(_owner);
    }
}
