// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../../tokens/VolmexBaseToken.sol";
import "../../tokens/VolmexQuoteToken.sol";

import "../../interfaces/IPerpFactory.sol";
import "../../interfaces/IVolmexQuoteToken.sol";
import "../../interfaces/IVolmexBaseToken.sol";
import "../../interfaces/IVaultController.sol";
import "../../interfaces/IVault.sol";

/**
 * @title Factory Contract for zkSync
 * @author volmex.finance [security@volmexlabs.com]
 */
contract TokenFactoryZk is IPerpFactory, Initializable {
    // To store the address of volatility.
    mapping(uint256 => IVolmexBaseToken) public baseTokenByIndex;

    // To store the address of collateral.
    mapping(uint256 => IVolmexQuoteToken) public quoteTokenByIndex;

    // Used to store the address and name of volatility at a particular _index (incremental state of 1)
    uint256 public baseTokenIndexCount;

    // Used to store the address and name of collateral at a particular _index (incremental state of 1)
    uint256 public quoteTokenIndexCount;

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
}
