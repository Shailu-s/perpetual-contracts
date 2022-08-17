// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../tokens/VolmexBaseToken.sol";
import "../tokens/VolmexQuoteToken.sol";
import "../orderbook/Positioning.sol";
import "../orderbook/VaultController.sol";
import "../orderbook/AccountBalance.sol";
import "../interfaces/IVolmexBaseToken.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVolmexQuoteToken.sol";
import "../interfaces/IPerpFactory.sol";

/**
 * @title Factory Contract for zkSync
 * @author volmex.finance [security@volmexlabs.com]
 */
contract PerpFactoryZk is IPerpFactory, Initializable {
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

    /**
     * @notice Intializes the Factory and stores the implementations
     */
    function initialize() external initializer {}

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
        volmexBaseToken = new VolmexBaseToken();
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
    function cloneQuoteToken(string memory _name, string memory _symbol)
        external
        returns (IVolmexQuoteToken volmexQuoteToken)
    {
        volmexQuoteToken = new VolmexQuoteToken();
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
        uint256 _vaultControllerIndex
    ) external returns (IVault vault) {
        IVaultController vaultController = vaultControllersByIndex[_vaultControllerIndex];
        require(address(vaultController) != address(0), "PerpFactory: Vault Controller Not Found");

        vault = new Vault();
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
        address _matchingEngine,
        address _markPriceOracle,
        address _indexPriceOracle
    )
        external
        returns (
            IPositioning positioning,
            IVaultController vaultController,
            IAccountBalance accountBalance
        )
    {
        accountBalance = _cloneAccountBalance(_positioningConfig);
        vaultController = _cloneVaultController(_positioningConfig, address(accountBalance));
        positioning = _clonePositioning(
            _positioningConfig,
            vaultController,
            _matchingEngine,
            address(accountBalance),
            _markPriceOracle,
            _indexPriceOracle
        );

        emit PerpSystemCreated(perpIndexCount, address(positioning), address(vaultController), address(accountBalance));
        perpIndexCount++;
    }

    function _cloneVaultController(
        address _positioningConfig,
        address _accountBalance
    ) private returns (IVaultController vaultController) {
        vaultController = new VaultController();
        vaultController.initialize(_positioningConfig, _accountBalance);
        vaultControllersByIndex[perpIndexCount] = vaultController;
    }

    function _clonePositioning(
        address _positioningConfig,
        IVaultController _vaultController,
        address _matchingEngine,
        address _accountBalance,
        address _markPriceOracle,
        address _indexPriceOracle
    ) private returns (IPositioning positioning) {
        positioning = new Positioning();
        positioning.initialize(_positioningConfig, address(_vaultController), _matchingEngine, _accountBalance, _markPriceOracle, _indexPriceOracle);
        _vaultController.setPositioning(address(positioning));
        positioningByIndex[perpIndexCount] = positioning;
    }

    function _cloneAccountBalance(address _positioningConfig)
        private
        returns (IAccountBalance accountBalance)
    {
        accountBalance = new AccountBalance();
        accountBalance.initialize(_positioningConfig);
        accountBalanceByIndex[perpIndexCount] = address(accountBalance);
    }
}
