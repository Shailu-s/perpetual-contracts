// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "./MatchingEngineCore.sol";
import "./TransferManager.sol";
import "../helpers/RoleManager.sol";

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
        // TODO: Verify whether we should use address(this) or _msgSender()
        _grantRole(CAN_ADD_OBSERVATION, address(this));
        _grantRole(CAN_CANCEL_ALL_ORDERS, address(this));

        _transferOwnership(_owner);
    }

    function _msgSender() 
    internal 
    view 
    virtual 
    override(MatchingEngineCore, ContextUpgradeable) 
    returns (address) {
        return super._msgSender();
    }

    function _msgData() 
    internal 
    view 
    virtual 
    override(MatchingEngineCore, ContextUpgradeable) 
    returns (bytes calldata) {
        return msg.data;
    }
}
