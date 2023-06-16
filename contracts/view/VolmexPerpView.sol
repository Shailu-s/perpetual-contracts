// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../libs/LibOrder.sol";
import "../interfaces/IVolmexPerpView.sol";

contract VolmexPerpView is IVolmexPerpView, AccessControlUpgradeable {
    // admin of perp view contract
    bytes32 public constant VOLMEX_PERP_VIEW = keccak256("VOLMEX_PERP_VIEW");
    // perp view role to set contracts
    bytes32 public constant PERP_VIEW_STATES = keccak256("PERP_VIEW_STATES");
    // Store the addresses of positionings { index => positioning address }
    mapping(uint256 => IPositioning) public positionings;
    // Store the addresses of vaultControllers { index => vaultController address }
    mapping(uint256 => IVaultController) public vaultControllers;
    // To store the address of volatility.
    mapping(uint256 => IVolmexBaseToken) public baseTokens;
    // To store the address of collateral.
    mapping(uint256 => IVolmexQuoteToken) public quoteTokens;
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
        _grantRole(VOLMEX_PERP_VIEW, _viewRole);
    }

    function grantViewStatesRole(address _viewStateRole) external {
        _requireVolmexPerpViewAdmin();
        _grantRole(PERP_VIEW_STATES, _viewStateRole);
    }

    function setBaseToken(IVolmexBaseToken _baseToken) external {
        _requireVolmexPerpViewCaller();
        baseTokens[baseTokenIndexCount] = _baseToken;
        baseTokenIndexCount++;
    }

    function setQuoteToken(IVolmexQuoteToken _quoteToken) external {
        _requireVolmexPerpViewCaller();
        quoteTokens[quoteTokenIndexCount] = _quoteToken;
        quoteTokenIndexCount++;
    }

    function setPositioning(IPositioning _positioning) external {
        _requireVolmexPerpViewCaller();
        positionings[perpIndexCount] = _positioning;
    }

    function setVaultController(IVaultController _vaultController) external {
        _requireVolmexPerpViewCaller();
        vaultControllers[perpIndexCount] = _vaultController;
    }

    function setAccount(IAccountBalance _account) external {
        _requireVolmexPerpViewCaller();
        accounts[perpIndexCount] = _account;
    }

    function setMarketRegistry(IMarketRegistry _marketRegistry) external {
        _requireVolmexPerpViewCaller();
        marketRegistries[perpIndexCount] = _marketRegistry;
    }

    function incrementPerpIndex() external {
        _requireVolmexPerpViewCaller();
        perpIndexCount++;
    }

    function incrementVaultIndex() external {
        _requireVolmexPerpViewCaller();
        vaultIndexCount++;
    }

    function _requireVolmexPerpViewAdmin() internal view {
        require(hasRole(VOLMEX_PERP_VIEW, _msgSender()), "VolmexPerpView: Not admin");
    }

    function _requireVolmexPerpViewCaller() internal view {
        require(hasRole(PERP_VIEW_STATES, _msgSender()), "VolmexPerpView: Not state update caller");
    }
}
