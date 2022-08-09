// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

import "../VolmexBaseToken.sol";
import "../../orderbook/Positioning.sol";
import "../../helpers/BlockContext.sol";
import "../../interfaces/IVolmexBaseToken.sol";
import "../../interfaces/IVaultController.sol";
import "../../interfaces/IPositioning.sol";
import "../../orderbook/VaultController.sol";

/**
 * @title Factory Contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract PerpFactory is Initializable, BlockContext {
    event PerpSystemCreated(uint256 indexed perpIndex, address indexed positioning, address indexed vaultController);

    // Volatility token implementation contract for factory
    address public tokenImplementation;

    // Vault Controller implementation contract for factory
    address public vaultControllerImplementation;

    // Address of positioning contract implementation
    address public positioningImplementation;

    // Address of vault contract implementation
    address public vaultImplementation;

    // To store the address of volatility.
    mapping(uint256 => address) public tokenByIndex;

    // Mapping to store VaultControllers by index
    mapping(uint256 => address) public vaultControllersByIndex;

    // Store the addresses of positioning contract by index
    mapping(uint256 => IPositioning) public positioningByIndex;

    // Used to store the address and name of volatility at a particular _index (incremental state of 1)
    uint256 public tokenIndexCount;

    // Used to store the address of perp ecosystem at a particular _index (incremental state of 1)
    uint256 public perpIndexCount;

    // Used to store a boolean value if blockchain is ZkSync
    bool public isZkSync;

    /**
     * @notice Get the address of tokenImplementation contracts instance.
     */
    function initialize(
        address _tokenImplementation,
        address _vaultControllerImplementation,
        address _vaultImplementation
    ) external initializer {
        tokenImplementation = _tokenImplementation;
        vaultControllerImplementation = _vaultControllerImplementation;
        vaultImplementation = _vaultImplementation;

        // Get networkId & check for ZkSync
        uint256 networkId = _networkId();

        // TODO: Add check for zkSync mainnet as well
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
    function cloneBaseToken(
        string memory _name,
        string memory _symbol,
        address _priceFeed
    ) external returns (address) {
        IVolmexBaseToken volmexBaseToken;
        if (isZkSync) {
            volmexBaseToken = new VolmexBaseToken();

            volmexBaseToken.initialize(_name, _symbol, _priceFeed, true);
        } else {
            bytes32 salt = keccak256(abi.encodePacked(tokenIndexCount, _name, _symbol));

            volmexBaseToken = VolmexBaseToken(Clones.cloneDeterministic(tokenImplementation, salt));
            volmexBaseToken.initialize(_name, _symbol, _priceFeed, true);
        }
        tokenByIndex[tokenIndexCount] = address(volmexBaseToken);
        tokenIndexCount++;
        return address(volmexBaseToken);
    }

    function clonePerpEcosystem(
        address _positioningConfig,
        address _quoteToken,
        address _exchange,
        address _accountBalance,
        address _insuranceFund
    ) external returns (IPositioning positioning, IVaultController vaultController) {
        positioning = _clonePositioning(_positioningConfig, _quoteToken, _exchange, _accountBalance, _insuranceFund);
        vaultController = _cloneVaultController(address(positioning), _positioningConfig, _accountBalance);

        emit PerpSystemCreated(perpIndexCount, address(positioning), address(vaultController));
        perpIndexCount++;
    }

    function _cloneVaultController(
        address _positioning,
        address _positioningConfig,
        address _accountBalance
    ) internal returns (IVaultController vaultController) {
        if (isZkSync) {
            vaultController = new VaultController();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(perpIndexCount, vaultImplementation));
            vaultController = IVaultController(Clones.cloneDeterministic(vaultControllerImplementation, salt));
        }

        vaultController.initialize(_positioning, _positioningConfig, _accountBalance, vaultImplementation);
        vaultControllersByIndex[perpIndexCount] = address(vaultController);
    }

    function _clonePositioning(
        address _positioningConfig,
        address _quoteToken,
        address _exchange,
        address _accountBalance,
        address _insuranceFund
    ) internal returns (IPositioning positioning) {
        if (isZkSync) {
            positioning = new Positioning();
        } else {
            bytes32 salt = keccak256(abi.encodePacked(perpIndexCount, _positioningConfig));
            positioning = IPositioning(Clones.cloneDeterministic(positioningImplementation, salt));
        }
        positioning.initialize(_positioningConfig, _quoteToken, _exchange, _accountBalance, _insuranceFund);
        positioningByIndex[perpIndexCount] = positioning;
    }
}
