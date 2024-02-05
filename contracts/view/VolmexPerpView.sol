// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { IPerpView, IPositioning, IVaultController, IBaseToken, IQuoteToken, IAccountBalance, IMarketRegistry } from "../interfaces/IPerpView.sol";
import { LibOrder } from "../libs/LibOrder.sol";

contract PerpView is IPerpView, AccessControlUpgradeable {
    // admin of perp view contract
    bytes32 public constant _PERP_VIEW = keccak256("_PERP_VIEW");
    // perp view role to set contracts
    bytes32 public constant PERP_VIEW_STATES = keccak256("PERP_VIEW_STATES");
    // Store the addresses of positionings { index => positioning address }
    mapping(uint256 => IPositioning) public positionings;
    // Store the addresses of vaultControllers { index => vaultController address }
    mapping(uint256 => IVaultController) public vaultControllers;
    // To store the address of volatility.
    mapping(uint256 => IBaseToken) public baseTokens;
    // To store the address of collateral.
    mapping(uint256 => IQuoteToken) public quoteTokens;
    // Store the addresses of account balance by index
    mapping(uint256 => IAccountBalance) public accounts;
    // Store the addresses of market regsitry by index
    mapping(uint256 => IMarketRegistry) public marketRegistries;
    // Used to set the index of positioning
    uint256 public perpIndexCount;
    // Used to store the address of vault at a particular _index (incremental state of 1)
    uint256 public vaultIndexCount;
    // Used to store the address and name of volatility at a particular _index (incremental state of 1)
    uint256 public baseTokenIndexCount;
    // Used to store the address and name of collateral at a particular _index (incremental state of 1)
    uint256 public quoteTokenIndexCount;

    function initialize(address _viewRole) external initializer {
        _grantRole(_PERP_VIEW, _viewRole);
    }

    function grantViewStatesRole(address _viewStateRole) external {
        _requirePerpViewAdmin();
        _grantRole(PERP_VIEW_STATES, _viewStateRole);
    }

    function setBaseToken(IBaseToken _baseToken) external {
        _requirePerpViewCaller();
        baseTokens[baseTokenIndexCount] = _baseToken;
        baseTokenIndexCount++;
    }

    function setQuoteToken(IQuoteToken _quoteToken) external {
        _requirePerpViewCaller();
        quoteTokens[quoteTokenIndexCount] = _quoteToken;
        quoteTokenIndexCount++;
    }

    function setPositioning(IPositioning _positioning) external {
        _requirePerpViewCaller();
        positionings[perpIndexCount] = _positioning;
    }

    function setVaultController(IVaultController _vaultController) external {
        _requirePerpViewCaller();
        vaultControllers[perpIndexCount] = _vaultController;
    }

    function setAccount(IAccountBalance _account) external {
        _requirePerpViewCaller();
        accounts[perpIndexCount] = _account;
    }

    function setMarketRegistry(IMarketRegistry _marketRegistry) external {
        _requirePerpViewCaller();
        marketRegistries[perpIndexCount] = _marketRegistry;
    }

    function incrementPerpIndex() external {
        _requirePerpViewCaller();
        perpIndexCount++;
    }

    function incrementVaultIndex() external {
        _requirePerpViewCaller();
        vaultIndexCount++;
    }

    function _requirePerpViewAdmin() internal view {
        require(hasRole(_PERP_VIEW, _msgSender()), "PerpView: Not admin");
    }

    function _requirePerpViewCaller() internal view {
        require(hasRole(PERP_VIEW_STATES, _msgSender()), "PerpView: Not state update caller");
    }
}
