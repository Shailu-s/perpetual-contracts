// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165StorageUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../interfaces/IVolmexProtocol.sol";
import "../interfaces/IIndexPriceOracle.sol";

/**
 * @title Volmex Oracle contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract IndexPriceOracle is ERC165StorageUpgradeable, IIndexPriceOracle, AccessControlUpgradeable {
    // price precision constant upto 6 decimal places
    uint256 private constant _VOLATILITY_PRICE_PRECISION = 1000000;
    // Interface ID of VolmexOracle contract, hashId = 0xf9fffc9f
    bytes4 private constant _IVOLMEX_ORACLE_ID = type(IIndexPriceOracle).interfaceId;
    // index price admin role
    bytes32 public constant INDEX_PRICE_ORACLE_ADMIN = keccak256("INDEX_PRICE_ORACLE_ADMIN");

    // Store the price of volatility by indexes { 0 - ETHV, 1 = BTCV }
    mapping(uint256 => uint256) private _volatilityTokenPriceByIndex;

    // Store the volatilitycapratio by index
    mapping(uint256 => uint256) public volatilityCapRatioByIndex;
    // Store the proof of hash of the current volatility token price
    mapping(uint256 => bytes32) public volatilityTokenPriceProofHash;
    // Store the timestamp of volatility price update by index
    mapping(uint256 => uint256) public volatilityLastUpdateTimestamp;
    // Store the number of indexes
    uint256 public indexCount;

    /**
     * @notice Initializes the contract setting the deployer as the initial owner.
     */
    function initialize(address _owner) external initializer {
        // TODO: Add observation add logic here
        volatilityCapRatioByIndex[indexCount] = 400000000;

        indexCount++;

        // TODO: Add observation add logic here
        volatilityCapRatioByIndex[indexCount] = 400000000;

        __ERC165Storage_init();
        _registerInterface(_IVOLMEX_ORACLE_ID);
        _grantRole(INDEX_PRICE_ORACLE_ADMIN, _owner);
    }

    /**
     * @notice Add volatility token price by index
     * @param _volatilityTokenPrice Price of the adding volatility token
     * @param _protocol Address of the VolmexProtocol of which the price is added
     * @param _volatilityTokenSymbol Symbol of the adding volatility token
     * @param _leverage Value of leverage on token {2X: 2, 5X: 5}
     * @param _baseVolatilityIndex Index of the base volatility {0: ETHV, 1: BTCV}
     * @param _proofHash Bytes32 value of token price proof of hash
     */
    function addVolatilityIndex(
        uint256 _volatilityTokenPrice,
        IVolmexProtocol _protocol,
        string calldata _volatilityTokenSymbol,
        uint256 _leverage,
        uint256 _baseVolatilityIndex,
        bytes32 _proofHash
    ) external {
        _requireIndexPriceOracleAdmin();
        require(address(_protocol) != address(0), "VolmexOracle: protocol address can't be zero");
        uint256 _volatilityCapRatio = _protocol.volatilityCapRatio() * _VOLATILITY_PRICE_PRECISION;
        require(_volatilityCapRatio >= 1000000, "VolmexOracle: volatility cap ratio should be greater than 1000000");
        uint256 _index = ++indexCount;
        volatilityCapRatioByIndex[_index] = _volatilityCapRatio;
        require(
            _volatilityTokenPrice <= _volatilityCapRatio,
            "VolmexOracle: _volatilityTokenPrice should be smaller than VolatilityCapRatio"
        );
        // TODO: Add observation add logic here

        emit VolatilityIndexAdded(_index, _volatilityCapRatio, _volatilityTokenSymbol, _volatilityTokenPrice);
    }

    /**
     * @notice Updates the volatility token price by index
     *
     * @dev Check if volatility token price is greater than zero (0)
     * @dev Update the volatility token price corresponding to the volatility token symbol
     * @dev Store the volatility token price corresponding to the block number
     * @dev Update the proof of hash for the volatility token price
     *
     * @param _volatilityIndexes Number array of values of the volatility index. { eg. 0 }
     * @param _volatilityTokenPrices array of prices of volatility token, between {0, 250000000}
     * @param _proofHashes arrau of Bytes32 values of token prices proof of hash
     *
     * NOTE: Make sure the volatility token price are with 6 decimals, eg. 125000000
     */
    function updateBatchVolatilityTokenPrice(
        uint256[] memory _volatilityIndexes,
        uint256[] memory _volatilityTokenPrices,
        bytes32[] memory _proofHashes
    ) external {
        _requireIndexPriceOracleAdmin();
        require(
            _volatilityIndexes.length == _volatilityTokenPrices.length &&
                _volatilityIndexes.length == _proofHashes.length,
            "VolmexOracle: length of input arrays are not equal"
        );
        for (uint256 i = 0; i < _volatilityIndexes.length; i++) {
            require(
                _volatilityTokenPrices[i] <= volatilityCapRatioByIndex[_volatilityIndexes[i]],
                "VolmexOracle: _volatilityTokenPrice should be smaller than VolatilityCapRatio"
            );
            // TODO: Add observation add logic here
        }

        emit BatchVolatilityTokenPriceUpdated(_volatilityIndexes, _volatilityTokenPrices, _proofHashes);
    }

    /**
     * @notice Adds a new datapoint to the datapoints storage array
     *
     * @param _index Datapoints volatility index id {0}
     * @param _value Datapoint value to add {250000000}
     */
    function addIndexDataPoint(uint256 _index, uint256 _value) external {
        _requireIndexPriceOracleAdmin();
    }

    /**
     * @notice Get the volatility token price by index
     * @param _index index of the volatility token
     */
    function getVolatilityTokenPriceByIndex(
        uint256 _index
    ) external view returns (uint256 volatilityTokenPrice, uint256 iVolatilityTokenPrice, uint256 lastUpdateTimestamp) {
        (volatilityTokenPrice, iVolatilityTokenPrice, lastUpdateTimestamp) = _getVolatilityTokenPrice(_index);
    }

    /**
     * @notice Get the TWAP value from current available datapoints
     * @param _index Datapoints volatility index id {0}
     *
     * @dev This method is a replica of `getVolatilityTokenPriceByIndex(_index)`
     */
    function getIndexTwap(
        uint256 _index
    ) external view returns (uint256 volatilityTokenTwap, uint256 iVolatilityTokenTwap, uint256 lastUpdateTimestamp) {
        (volatilityTokenTwap, iVolatilityTokenTwap, lastUpdateTimestamp) = _getVolatilityTokenPrice(_index);
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlUpgradeable, ERC165StorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _requireIndexPriceOracleAdmin() internal view {
        require(hasRole(INDEX_PRICE_ORACLE_ADMIN, _msgSender()), "IndexPriceOracle: Not admin");
    }

    function _getVolatilityTokenPrice(
        uint256 _index
    ) private view returns (uint256 volatilityTokenTwap, uint256 iVolatilityTokenTwap, uint256 lastUpdateTimestamp) {
        // TODO: Add observation add logic here, calculation of twap price cumulative
        volatilityTokenTwap = 0;
        lastUpdateTimestamp = volatilityLastUpdateTimestamp[_index];
        iVolatilityTokenTwap = volatilityCapRatioByIndex[_index] - volatilityTokenTwap;
    }
}
