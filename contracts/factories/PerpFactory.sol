// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../interfaces/IVault.sol";
import "../interfaces/IVolmexBaseToken.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IAccountBalance.sol";
import "../interfaces/IVolmexQuoteToken.sol";
import "../interfaces/IPerpFactory.sol";
import "../interfaces/IMatchingEngine.sol";
import "../interfaces/IVolmexPerpView.sol";

import "../helpers/RoleManager.sol";

/**
 * @title Factory Contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract PerpFactory is Initializable, IPerpFactory, RoleManager {
    // virtual base token implementation contract for factory
    address public baseTokenImplementation;

    // virtual quote token implementation contract for factory
    address public quoteTokenImplementation;

    // Vault Controller implementation contract for factory
    address public vaultControllerImplementation;

    // Address of positioning contract implementation
    address public positioningImplementation;

    // Address of vault contract implementation
    address public vaultImplementation;

    // Address of the account balance contract implementation
    address public accountBalanceImplementation;

    // Address of the Perpetual View and Registry contract
    IVolmexPerpView public perpViewRegistry;

    /**
     * @notice Intializes the Factory and stores the implementations
     */
    function initialize(
        address _baseTokenImplementation,
        address _quoteTokenImplementation,
        address _vaultControllerImplementation,
        address _vaultImplementation,
        address _positioningImplementation,
        address _accountBalanceImplementation,
        IVolmexPerpView _perpViewRegistry
    ) external initializer {
        baseTokenImplementation = _baseTokenImplementation;
        quoteTokenImplementation = _quoteTokenImplementation;
        vaultControllerImplementation = _vaultControllerImplementation;
        vaultImplementation = _vaultImplementation;
        positioningImplementation = _positioningImplementation;
        accountBalanceImplementation = _accountBalanceImplementation;
        perpViewRegistry = _perpViewRegistry;
        _grantRole(CLONES_DEPLOYER, _msgSender());
    }

    /**
     * @notice Clones the base token - { returns base token address }
     *
     * @dev Generates a salt using baseTokenIndexCount, token name and token symbol
     * @dev Clone the base token implementation with a salt make it deterministic
     * @dev Initializes the base token
     *
     * @param _name is the name of base token
     * @param _symbol is the symbol of base token
     * @param _priceFeed is the address of referenced price oracle
     */
    function cloneBaseToken(
        string memory _name,
        string memory _symbol,
        address _priceFeed
    ) external returns (IVolmexBaseToken volmexBaseToken) {
        _requireClonesDeployer();
        uint256 baseIndex = perpViewRegistry.baseTokenIndexCount();
        bytes32 salt = keccak256(abi.encodePacked(baseIndex, _name, _symbol));
        volmexBaseToken = IVolmexBaseToken(Clones.cloneDeterministic(baseTokenImplementation, salt));
        volmexBaseToken.initialize(_name, _symbol, _priceFeed, true);
        perpViewRegistry.setBaseToken(volmexBaseToken);
        emit TokenCreated(baseIndex, address(volmexBaseToken));
    }

    /**
     * @notice Clones the quote token - { returns quote token address }
     *
     * @dev Generates a salt using quoteTokenIndexCount, token name and token symbol
     * @dev Clone the quote token implementation with a salt make it deterministic
     * @dev Initializes the quote token
     *
     * @param _name is the name of quote token
     * @param _symbol is the symbol of quote token
     */
    function cloneQuoteToken(string memory _name, string memory _symbol)
        external
        returns (IVolmexQuoteToken volmexQuoteToken)
    {
        _requireClonesDeployer();
        uint256 quoteIndex = perpViewRegistry.quoteTokenIndexCount();

        bytes32 salt = keccak256(abi.encodePacked(quoteIndex, _name, _symbol));
        volmexQuoteToken = IVolmexQuoteToken(Clones.cloneDeterministic(quoteTokenImplementation, salt));
        volmexQuoteToken.initialize(_name, _symbol, false);
        perpViewRegistry.setQuoteToken(volmexQuoteToken);
        emit TokenCreated(quoteIndex, address(volmexQuoteToken));
    }

    /**
     * @notice Clones the vault
     */
    function cloneVault(
        address _token,
        bool _isEthVault,
        address _positioningConfig,
        address _accountBalance,
        address _vaultImplementation,
        uint256 _vaultControllerIndex
    ) external returns (IVault vault) {
        _requireClonesDeployer();
        IVaultController vaultController = perpViewRegistry.vaultControllers(_vaultControllerIndex);
        require(address(vaultController) != address(0), "PerpFactory: Vault Controller Not Found");

        bytes32 salt = keccak256(abi.encodePacked(_token, perpViewRegistry.vaultIndexCount()));
        vault = IVault(Clones.cloneDeterministic(_vaultImplementation, salt));
        vault.initialize(_positioningConfig, _accountBalance, _token, address(vaultController), _isEthVault);

        vaultController.registerVault(address(vault), _token);
        perpViewRegistry.incrementVaultIndex();
        emit VaultCreated(address(vault), _token);
    }

    /**
     * @notice Clones the complete perpetual ecosystem
     */
    function clonePerpEcosystem(
        address _positioningConfig,
        address _matchingEngine,
        address _markPriceOracle,
        address _indexPriceOracle,
        uint64 _underlyingPriceIndex
    )
        external
        returns (
            IPositioning positioning,
            IVaultController vaultController,
            IAccountBalance accountBalance
        )
    {
        _requireClonesDeployer();
        uint256 perpIndex = perpViewRegistry.perpIndexCount();
        accountBalance = _cloneAccountBalance(perpIndex, _positioningConfig);
        vaultController = _cloneVaultController(perpIndex, _positioningConfig, address(accountBalance));
        positioning = _clonePositioning(
            perpIndex,
            _positioningConfig,
            vaultController,
            _matchingEngine,
            address(accountBalance),
            _markPriceOracle,
            _indexPriceOracle,
            _underlyingPriceIndex
        );

        emit PerpSystemCreated(perpIndex, address(positioning), address(vaultController), address(accountBalance));
        perpViewRegistry.incrementPerpIndex();
    }

    function _cloneVaultController(
        uint256 _perpIndex,
        address _positioningConfig,
        address _accountBalance
    ) private returns (IVaultController vaultController) {
        bytes32 salt = keccak256(abi.encodePacked(_perpIndex, vaultImplementation));
        vaultController = IVaultController(Clones.cloneDeterministic(vaultControllerImplementation, salt));
        vaultController.initialize(_positioningConfig, _accountBalance);
        perpViewRegistry.setVaultController(vaultController);
    }

    function _clonePositioning(
        uint256 _perpIndex,
        address _positioningConfig,
        IVaultController _vaultController,
        address _matchingEngine,
        address _accountBalance,
        address _markPriceOracle,
        address _indexPriceOracle,
        uint64 _underlyingPriceIndex
    ) private returns (IPositioning positioning) {
        bytes32 salt = keccak256(abi.encodePacked(_perpIndex, _positioningConfig));
        positioning = IPositioning(Clones.cloneDeterministic(positioningImplementation, salt));
        positioning.initialize(
            _positioningConfig,
            address(_vaultController),
            _matchingEngine,
            _accountBalance,
            _markPriceOracle,
            _indexPriceOracle,
            _underlyingPriceIndex
        );
        _vaultController.setPositioning(address(positioning));
        perpViewRegistry.setPositioning(positioning);
    }

    function _cloneAccountBalance(uint256 _perpIndex, address _positioningConfig)
        private
        returns (IAccountBalance accountBalance)
    {
        bytes32 salt = keccak256(abi.encodePacked(_perpIndex, _positioningConfig));
        accountBalance = IAccountBalance(Clones.cloneDeterministic(accountBalanceImplementation, salt));
        accountBalance.initialize(_positioningConfig);
        perpViewRegistry.setAccount(accountBalance);
    }

    function _requireClonesDeployer() internal view {
        // PerpFactory: Not CLONES_DEPLOYER
        require(hasRole(CLONES_DEPLOYER, _msgSender()), "PF_NCD");
    }
}
