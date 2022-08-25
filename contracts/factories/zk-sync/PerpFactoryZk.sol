// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../../orderbook/Positioning.sol";
import "../../orderbook/VaultController.sol";
import "../../orderbook/AccountBalance.sol";
import "../../interfaces/IVaultController.sol";
import "../../interfaces/IPositioning.sol";
import "../../interfaces/IPerpFactory.sol";

/**
 * @title Factory Contract for zkSync
 * @author volmex.finance [security@volmexlabs.com]
 */
contract PerpFactoryZk is IPerpFactory, Initializable {
    // Mapping to store VaultControllers by index
    mapping(uint256 => IVaultController) public vaultControllersByIndex;

    // Store the addresses of positioning contract by index
    mapping(uint256 => IPositioning) public positioningByIndex;

    // Store the addresses of account balance by index
    mapping(uint256 => address) public accountBalanceByIndex;

    // Used to store the address of perp ecosystem at a particular _index (incremental state of 1)
    uint256 public perpIndexCount;

    // Used to store the address of vault at a particular _index (incremental state of 1)
    uint256 public vaultIndexCount;

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
        accountBalance = _cloneAccountBalance(_positioningConfig);
        vaultController = _cloneVaultController(_positioningConfig, address(accountBalance));
        positioning = _clonePositioning(
            _positioningConfig,
            vaultController,
            _matchingEngine,
            address(accountBalance),
            _markPriceOracle,
            _indexPriceOracle,
            _underlyingPriceIndex
        );

        emit PerpSystemCreated(perpIndexCount, address(positioning), address(vaultController), address(accountBalance));
        perpIndexCount++;
    }

    function _cloneVaultController(address _positioningConfig, address _accountBalance)
        private
        returns (IVaultController vaultController)
    {
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
        address _indexPriceOracle,
        uint64 _underlyingPriceIndex
    ) private returns (IPositioning positioning) {
        positioning = new Positioning();
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
        positioningByIndex[perpIndexCount] = positioning;
    }

    function _cloneAccountBalance(address _positioningConfig) private returns (IAccountBalance accountBalance) {
        accountBalance = new AccountBalance();
        accountBalance.initialize(_positioningConfig);
        accountBalanceByIndex[perpIndexCount] = address(accountBalance);
    }
}
