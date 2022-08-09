// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../VolmexBaseToken.sol";
import "../../interfaces/IVolmexBaseToken.sol";
import { IVaultController } from "../../interfaces/IVaultController.sol";
import { IAccountBalance } from "../../interfaces/IAccountBalance.sol";
import "../../../contracts/orderbook/VaultController.sol";
import "../../../contracts/orderbook/AccountBalance.sol";

/**
* @title Factory Contract
* @author volmex.finance [security@volmexlabs.com]
*/
contract Factory is Initializable {

    event NewVaultCreated(address indexed vault, address indexed token);

    // Volatility token implementation contract for factory
    address public tokenImplementation;

    // Vault Controller implementation contract for factory
    address public vaultControllerImplementation;

    address public accountBalanceImplementation;

    // To store the address of volatility.
    mapping(uint256 => address) public tokenByIndex;

    mapping(uint256 => address) public accountBalanceByIndex;

    // Mapping to store VaultControllers by index
    mapping(uint256 => address) public vaultControllersByIndex;

    // Used to store the address and name of volatility at a particular _index (incremental state of 1)
    uint256 public tokenIndexCount;

    // Used to store the address and name of VaultController at a particular _index (incremental state of 1)
    uint256 public vaultControllerIndexCount;

    // Used to store a boolean value if blockchain is ZkSync
    bool public isZkSync;

    /**
    * @notice Get the address of tokenImplementation contracts instance.
    */
    function initialize(
        address _tokenImplementation,
        address _vaultControllerImplementation,
        address _accountBalanceImplementation
    ) external initializer {
        tokenImplementation = _tokenImplementation;
        vaultControllerImplementation = _vaultControllerImplementation;
        accountBalanceImplementation = _accountBalanceImplementation;

        // Get networkId & check for ZkSync
        uint256 networkId;
        assembly {
            networkId := chainid()
        }

        // TODO: Update ZkSync networkId (currently using 280)
        isZkSync = (networkId == 280) ? true : false;
    }

    /**
    * @notice Clones the position token - { returns position token address }
    *
    * @dev Generates a salt using tokenIndexCount, token name and token symbol
    * @dev Clone the position token implementation with a salt make it deterministic
    * @dev Initializes the position token
    *
    * @param _name is the name of volatility token
    * @param _symbol is the symbol of volatility token
    */
    function cloneBaseToken(string memory _name, string memory _symbol, address _priceFeed) 
    external returns (address) {
        IVolmexBaseToken volmexBaseToken;
        if (isZkSync) {
            volmexBaseToken = new VolmexBaseToken();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(tokenIndexCount, _name, _symbol));

            volmexBaseToken =
            VolmexBaseToken(
                Clones.cloneDeterministic(tokenImplementation, salt)
            );
        }
        volmexBaseToken.initialize(_name, _symbol, _priceFeed);
        tokenByIndex[tokenIndexCount] = address(volmexBaseToken);
        tokenIndexCount++;
        return address(volmexBaseToken);
    }

    function cloneVaultController(
        address _positioningArg,
        address _positioningConfig,
        address _accountBalanceArg,
        address _vaultImplementationArg
    ) external returns (address) {
        IVaultController vaultController;

        if (isZkSync) {
            vaultController = new VaultController();
        } else {
            bytes32 salt = keccak256(
                abi.encodePacked(
                    vaultControllerIndexCount, 
                    _vaultImplementationArg
                )
            );

            vaultController = IVaultController(
                Clones.cloneDeterministic(vaultControllerImplementation, salt)
            );
        }
        vaultController.initialize(
            _positioningArg, 
            _positioningConfig, 
            _accountBalanceArg, 
            _vaultImplementationArg
        );
        vaultControllersByIndex[vaultControllerIndexCount] = address(vaultController);
        vaultControllerIndexCount++;
        return address(vaultController);
    }

    function cloneVault(
        address _token, 
        bool isEthVault,
        address _positioningConfig,
        address _accountBalance,
        address _vaultImplementation,
        uint256 _vaultControllerIndex
    ) external returns (address) {
        address vaultControllerAddr = vaultControllersByIndex[_vaultControllerIndex];
        // F_VCNF: Vault Controller Not Found
        require(vaultControllerAddr != address(0), "F_VCNF");

        IVault vault;
        if (isZkSync) {
            vault = new Vault();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(_token, _vaultImplementation));
            vault = Vault(
                Clones.cloneDeterministic(_vaultImplementation, salt)
            );
        }
        vault.initialize(
            _positioningConfig, 
            _accountBalance, 
            _token, 
            vaultControllerAddr, 
            isEthVault
        );
        IVaultController(vaultControllerAddr).registerVault(address(vault), _token);
        emit NewVaultCreated(address(vault), _token);
        return address(vault);
    }

    function cloneAccountBalance(address _positioningConfigArg, address _orderBookArg) external returns (address) {
        IAccountBalance accountBalance;

        if (isZkSync) {
            accountBalance = new AccountBalance();
        } else {
            // TODO: Use perpIndexCount while creating salt
            bytes32 salt = keccak256(abi.encodePacked(accountBalanceImplementation));
            accountBalance = AccountBalance(
                Clones.cloneDeterministic(accountBalanceImplementation, salt)
            );

            accountBalance.initialize(
                _positioningConfigArg,
                _orderBookArg
            );
        }

        // TODO: Use perpIndexCount to store AccountBalance in mapping accountBalanceByIndex
        // accountBalanceByIndex[perpIndexCount] = address(accountBalance);

        return address(accountBalance);
    }
}
