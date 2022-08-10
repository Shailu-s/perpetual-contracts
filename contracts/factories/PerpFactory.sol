// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../tokens/VolmexBaseToken.sol";
import "../tokens/VolmexQuoteToken.sol";
import "../helpers/BlockContext.sol";
import "../orderbook/Positioning.sol";
import "../orderbook/VaultController.sol";
import "../orderbook/AccountBalance.sol";
import "../interfaces/IVolmexBaseToken.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVolmexQuoteToken.sol";

/**
 * @title Factory Contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract PerpFactory is Initializable, BlockContext {
    event PerpSystemCreated(
        uint256 indexed perpIndex,
        address positioning,
        address vaultController,
        address accountBalance
    );
    event VaultCreated(address indexed vault, address indexed token);
    event TokenCreated(uint256 indexed tokenIndex, address indexed token);

    // Volatility token implementation contract for factory
    address public tokenImplementation;

    // Vault Controller implementation contract for factory
    address public vaultControllerImplementation;

    // Address of positioning contract implementation
    address public positioningImplementation;

    // Address of vault contract implementation
    address public vaultImplementation;

    // Address of the account balance contract implementation
    address public accountBalanceImplementation;

    // To store the address of volatility.
    mapping(uint256 => IVolmexBaseToken) public baseTokenByIndex;

    // To store the address of collateral.
    mapping(uint256 => IVolmexQuoteToken) public quoteTokenByIndex;

    // Mapping to store VaultControllers by index
    mapping(uint256 => IVaultController) public vaultControllersByIndex;

    // Store the addresses of positioning contract by index
    mapping(uint256 => IPositioning) public positioningByIndex;

    // Store the addresses of account balance by index
    mapping(uint256 => address) public accountBalanceByIndex;

    // Used to store the address and name of volatility at a particular _index (incremental state of 1)
    uint256 public baseTokenIndexCount;

    // Used to store the address and name of collateral at a particular _index (incremental state of 1)
    uint256 public quoteTokenIndexCount;

    // Used to store the address of perp ecosystem at a particular _index (incremental state of 1)
    uint256 public perpIndexCount;

    // Used to store the address of vault at a particular _index (incremental state of 1)
    uint256 public vaultIndexCount;

    // Used to store a boolean value if blockchain is ZkSync
    bool public isZkSync;

    /**
     * @notice Intializes the Factory and stores the implementations
     */
    function initialize(
        address _tokenImplementation,
        address _vaultControllerImplementation,
        address _vaultImplementation,
        address _positioningImplementation,
        address _accountBalanceImplementation
    ) external initializer {
        tokenImplementation = _tokenImplementation;
        vaultControllerImplementation = _vaultControllerImplementation;
        vaultImplementation = _vaultImplementation;
        positioningImplementation = _positioningImplementation;
        accountBalanceImplementation = _accountBalanceImplementation;

        // Get networkId & check for ZkSync
        uint256 networkId = _networkId();

        // TODO: Add check for zkSync mainnet as well
        isZkSync = (networkId == 280) ? true : false;
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
        if (isZkSync) {
            volmexBaseToken = new VolmexBaseToken();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(baseTokenIndexCount, _name, _symbol));
            volmexBaseToken = VolmexBaseToken(Clones.cloneDeterministic(tokenImplementation, salt));
        }
        volmexBaseToken.initialize(_name, _symbol, _priceFeed, true);
        baseTokenByIndex[baseTokenIndexCount] = volmexBaseToken;
        emit TokenCreated(baseTokenIndexCount, address(volmexBaseToken));

        baseTokenIndexCount++;
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
    function cloneQuoteToken(
        string memory _name,
        string memory _symbol
    ) external returns (IVolmexQuoteToken volmexQuoteToken) {
        if (isZkSync) {
            volmexQuoteToken = new VolmexQuoteToken();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(quoteTokenIndexCount, _name, _symbol));
            volmexQuoteToken = IVolmexQuoteToken(Clones.cloneDeterministic(tokenImplementation, salt));
        }
        volmexQuoteToken.initialize(_name, _symbol, false);
        quoteTokenByIndex[quoteTokenIndexCount] = volmexQuoteToken;
        emit TokenCreated(quoteTokenIndexCount, address(volmexQuoteToken));

        quoteTokenIndexCount++;
    }

    /**
     * @notice Clones the vault
     */
    function cloneVault(
        address _token,
        bool isEthVault,
        address _positioningConfig,
        address _accountBalance,
        address _vaultImplementation,
        uint256 _vaultControllerIndex
    ) external returns (IVault vault) {
        IVaultController vaultController = vaultControllersByIndex[_vaultControllerIndex];
        require(address(vaultController) != address(0), "PerpFactory: Vault Controller Not Found");

        if (isZkSync) {
            vault = new Vault();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(_token, vaultIndexCount));
            vault = Vault(Clones.cloneDeterministic(_vaultImplementation, salt));
        }
        vault.initialize(_positioningConfig, _accountBalance, _token, address(vaultController), isEthVault);
        vaultIndexCount++;

        vaultController.registerVault(address(vault), _token);
        emit VaultCreated(address(vault), _token);
    }

    /**
     * @notice Clones the complete perpetual ecosystem
     */
    function clonePerpEcosystem(
        address _positioningConfig,
        address _quoteToken,
        address _exchange,
        address _insuranceFund,
        address _orderBook
    )
        external
        returns (
            IPositioning positioning,
            IVaultController vaultController,
            IAccountBalance accountBalance
        )
    {
        accountBalance = _cloneAccountBalance(_positioningConfig, _orderBook);
        positioning = _clonePositioning(
            _positioningConfig,
            _quoteToken,
            _exchange,
            address(accountBalance),
            _insuranceFund
        );
        vaultController = _cloneVaultController(address(positioning), _positioningConfig, address(accountBalance));

        emit PerpSystemCreated(perpIndexCount, address(positioning), address(vaultController), address(accountBalance));
        perpIndexCount++;
    }

    function _cloneVaultController(
        address _positioning,
        address _positioningConfig,
        address _accountBalance
    ) private returns (IVaultController vaultController) {
        if (isZkSync) {
            vaultController = new VaultController();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(perpIndexCount, vaultImplementation));
            vaultController = IVaultController(Clones.cloneDeterministic(vaultControllerImplementation, salt));
        }

        vaultController.initialize(_positioning, _positioningConfig, _accountBalance, vaultImplementation);
        vaultControllersByIndex[perpIndexCount] = vaultController;
    }

    function _clonePositioning(
        address _positioningConfig,
        address _quoteToken,
        address _exchange,
        address _accountBalance,
        address _insuranceFund
    ) private returns (IPositioning positioning) {
        if (isZkSync) {
            positioning = new Positioning();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(perpIndexCount, _positioningConfig));
            positioning = IPositioning(Clones.cloneDeterministic(positioningImplementation, salt));
        }
        positioning.initialize(_positioningConfig, _quoteToken, _exchange, _accountBalance, _insuranceFund);
        positioningByIndex[perpIndexCount] = positioning;
    }

    function _cloneAccountBalance(address _positioningConfig, address _orderBook)
        private
        returns (IAccountBalance accountBalance)
    {
        if (isZkSync) {
            accountBalance = new AccountBalance();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(perpIndexCount, _positioningConfig));
            accountBalance = IAccountBalance(Clones.cloneDeterministic(accountBalanceImplementation, salt));
        }
        accountBalance.initialize(_positioningConfig, _orderBook);
        accountBalanceByIndex[perpIndexCount] = address(accountBalance);
    }
}
