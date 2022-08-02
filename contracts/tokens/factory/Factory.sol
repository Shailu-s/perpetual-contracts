// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../VolmexBaseToken.sol";
import "../../interfaces/IVolmexBaseToken.sol";
import "../../../contracts/orderbook/VaultController.sol";

/**
 * @title Factory Contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract Factory is Initializable {

  // Volatility token implementation contract for factory
  address public tokenImplementation;
  
  // Vault Controller implementation contract for factory
  address public vaultControllerImplementation;

  // To store the address of volatility.
  mapping(uint256 => address) public tokenByIndex;
  
  // Mapping to store VaultControllers by index
  mapping(uint256 => address) public vaultControllersByIndex;

  // Used to store the address and name of volatility at a particular _index (incremental state of 1)
  uint256 public indexCount;

  // Used to store the address and name of VaultController at a particular _index (incremental state of 1)
  uint256 public vaultControllerIndexCount;

  // Used to store a boolean value if blockchain is ZkSync
  bool public isZkSync;

  /**
  	* @notice Get the address of tokenImplementation contracts instance.
  	*/
  function initialize(
    address _tokenImplementation,
    address _vaultControllerImplementation
  ) external initializer {
    tokenImplementation = _tokenImplementation;
    vaultControllerImplementation = _vaultControllerImplementation;

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
    * @dev Generates a salt using indexCount, token name and token symbol
    * @dev Clone the position token implementation with a salt make it deterministic
    * @dev Initializes the position token
    *
    * @param _name is the name of volatility token
    * @param _symbol is the symbol of volatility token
    */
  function cloneBaseToken(string memory _name, string memory _symbol, address _priceFeed)
      external
      returns (address)
  {
    IVolmexBaseToken volmexBaseToken;
    if (isZkSync) {
      volmexBaseToken = new VolmexBaseToken();

      volmexBaseToken.initialize(
          _name,
          _symbol,
          _priceFeed
      );
    } else {
      bytes32 salt = keccak256(abi.encodePacked(indexCount, _name, _symbol));

      volmexBaseToken =
        VolmexBaseToken(
          Clones.cloneDeterministic(tokenImplementation, salt)
        );
      volmexBaseToken.initialize(_name, _symbol, _priceFeed);
    }
    tokenByIndex[indexCount] = address(volmexBaseToken);
    indexCount++;
    return address(volmexBaseToken);
  }

  function cloneVaultController(
    address _positioningArg,
    address _positioningConfig,
    address _accountBalanceArg,
    address _vaultImplementationArg
  ) external returns (address) {
    VaultController vaultController;

    if (isZkSync) {
      vaultController = new VaultController();
      vaultController.initialize(_positioningArg, _positioningConfig, _accountBalanceArg, _vaultImplementationArg);
    }
    else {
      bytes32 salt = keccak256(
        abi.encodePacked(
          vaultControllerIndexCount, 
          _positioningArg,
          _positioningConfig,
          _accountBalanceArg,
          _vaultImplementationArg
        )
      );
      
      vaultController = VaultController(
        Clones.cloneDeterministic(vaultControllerImplementation, salt)
      );

      vaultController.initialize(_positioningArg, _positioningConfig, _accountBalanceArg, _vaultImplementationArg);
    }
    vaultControllersByIndex[vaultControllerIndexCount] = address(vaultController);
    vaultControllerIndexCount++;
    return address(vaultController);
  }
}
