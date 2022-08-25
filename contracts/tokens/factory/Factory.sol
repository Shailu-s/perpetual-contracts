// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "../VolmexBaseToken.sol";
import "../../interfaces/IVolmexBaseToken.sol";

/**
 * @title Factory Contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract Factory is Initializable {

  // Volatility token implementation contract for factory
  address public tokenImplementation;

  // To store the address of volatility.
  mapping(uint256 => address) public tokenByIndex;

  // Used to store the address and name of volatility at a particular _index (incremental state of 1)
  uint256 public indexCount;

  // Used to store a boolean value if blockchain is ZkSync
  bool public isZkSync;

  /**
  	* @notice Get the address of tokenImplementation contracts instance.
  	*/
  function initialize(address _tokenImplementation) external initializer {
    tokenImplementation = _tokenImplementation;

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
    } else {
      bytes32 salt = keccak256(abi.encodePacked(indexCount, _name, _symbol));

      volmexBaseToken =
        VolmexBaseToken(
          Clones.cloneDeterministic(tokenImplementation, salt)
        );
    }
    volmexBaseToken.initialize(_name, _symbol, true, _priceFeed);
    tokenByIndex[indexCount] = address(volmexBaseToken);
    indexCount++;
    return address(volmexBaseToken);
  }
}
