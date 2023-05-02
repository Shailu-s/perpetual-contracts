// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165StorageUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../interfaces/IIndexPriceOracle.sol";

/**
 * @title Volmex Oracle contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract IndexPriceOracle is AccessControlUpgradeable, ERC165StorageUpgradeable {
    struct IndexObservation {
        uint256 timestamp;
        uint256 underlyingPrice;
        bytes32 proofHash;
    }
    struct IndexPriceByEpoch {
        uint256 price;
        uint256 timestamp;
    }

    // Interface ID of VolmexOracle contract, hashId = 0xf9fffc9f
    bytes4 private constant _IVOLMEX_ORACLE_ID = type(IIndexPriceOracle).interfaceId;
    // price oracle admin role
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    // role of observation collection
    bytes32 public constant ADD_OBSERVATION_ROLE = keccak256("ADD_OBSERVATION_ROLE");
    bytes32 public constant INITIAL_TIMESTAMP_ROLE = keccak256("INITIAL_TIMESTAMP_ROLE");

    // indices of volatility index {0: ETHV, 1: BTCV}
    uint256 internal _indexCount;
    // mapping to store index to the address of the baseToken
    mapping(uint256 => address) public baseTokenByIndex;
    // mapping to store index by base token address
    mapping(address => uint256) public indexByBaseToken;
    // mapping to store baseToken to Observations
    mapping(uint256 => IndexObservation[]) public observationsByIndex;
    // Store the volatilitycapratio by index
    mapping(uint256 => uint256) public volatilityCapRatioByIndex;
    mapping(uint256 => IndexPriceByEpoch[]) public indexPriceAtEpochs;
    uint256 public indexSmInterval; // interval for sma calculation
    uint256 public initialTimestamp; // timestamp at the mark oracle first observation addition
    uint256 public cardinality; // number of prices used to calculate current epoch's average price

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint256[] index, uint256[] underlyingPrice, uint256 timestamp);
    event AssetsAdded(uint256 indexed lastIndex, address[] assets, uint256[] underlyingPrices);

    /**
     * @notice Initializes the contract setting the deployer as the initial owner.
     */
    function initialize(
        address _admin,
        uint256[] calldata _volatilityPrices,
        address[] calldata _volatilityIndex,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) external initializer {
        indexSmInterval = 8 hours;
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        _addAssets(_volatilityPrices, _volatilityIndex, _proofHash, _capRatio);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
        __ERC165Storage_init();
        _registerInterface(_IVOLMEX_ORACLE_ID);
    }

    function grantInitialTimestampRole(address _account) external {
        _requireOracleAdmin();
        _grantRole(INITIAL_TIMESTAMP_ROLE, _account);
    }

    /**
     * @param _smInterval Time in seconds
     */
    function setIndexSmInterval(uint256 _smInterval) external {
        _requireOracleAdmin();
        indexSmInterval = _smInterval;
    }

    function setInitialTimestamp(uint256 _timestamp) external {
        _requireInitialTimestampRole();
        initialTimestamp = _timestamp;
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _underlyingPrices Price of the asset
     * @param _indexes position of the asset
     * @param _proofHashes hash of price collection
     */
    function addObservation(
        uint256[] memory _underlyingPrices,
        uint256[] memory _indexes,
        bytes32[] memory _proofHashes
    ) external virtual {
        _requireCanAddObservation();
        uint256 numberOfPrices = _underlyingPrices.length;
        for (uint256 index; index < numberOfPrices; ++index) {
            require(_underlyingPrices[index] != 0, "IndexPriceOracle: Not zero");
            _pushOrderPrice(_indexes[index], _underlyingPrices[index], _proofHashes[index]);
            _saveEpoch(_indexes[index], _underlyingPrices[index]);

        }
        emit ObservationAdded(_indexes, _underlyingPrices, block.timestamp);
    }

    function getLastEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, block.timestamp);
    }

    function getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, _epochTimestamp);
    }

    /**
     * @notice Emulate the Chainlink Oracle interface for retrieving Volmex SMA volatility index
     * @param _index Datapoints volatility index id {0}
     * @param _smInterval time for averaging observations
     * @return answer is the answer for the given round
     */
    function latestRoundData(uint256 _smInterval, uint256 _index) external view virtual returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (answer, lastUpdateTimestamp) = _getCustomEpochPrice(_index, startTimestamp);
        answer *= 100;
    }

    /**
     * @notice Get volatility indices price of normal and inverse with last timestamp
     * @param _smInterval time interval for sma
     * @param _index Position of the observation
     */
    function getIndexSma(uint256 _smInterval, uint256 _index)
        external
        view
        returns (
            uint256 volatilityTokenSma,
            uint256 iVolatilityTokenSma,
            uint256 lastUpdateTimestamp
        )
    {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (volatilityTokenSma, lastUpdateTimestamp) = _getCustomIndexSma(_index, startTimestamp, block.timestamp);
        iVolatilityTokenSma = volatilityCapRatioByIndex[_index] - volatilityTokenSma;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(AccessControlUpgradeable, ERC165StorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    /**
     * @notice Set price observation collector
     *
     * @param _adder Address of price collector
     */
    function setObservationAdder(address _adder) external {
        _requireOracleAdmin();
        require(_adder != address(0), "IndexPriceOracle: zero address");
        _grantRole(ADD_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    /**
     * @notice Add new observation corresponding to the asset
     *
     * @param _underlyingPrice Array of current prices
     * @param _asset Array of assets {base token addresses}
     */
    function addAssets(
        uint256[] calldata _underlyingPrice,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) external {
        _requireOracleAdmin();
        _addAssets(_underlyingPrice, _asset, _proofHash, _capRatio);
    }

    /**
     * @notice Get the single moving average price of the asset
     *
     * @param _smInterval Time in seconds of the range
     * @param _index Index of the observation, the index base token mapping
     * @return priceCumulative The SMA price of the asset
     */
    function getLastSma(uint256 _smInterval, uint256 _index) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (priceCumulative,) = _getCustomIndexSma(_index, startTimestamp, block.timestamp);
    }

    /**
     * @notice Get price cumulative of custom window of the observations
     *
     * @param _index Position of the asset in Observations
     * @param _startTimestamp timestamp of start of window
     * @param _endTimestamp timestamp of last of window
     */
    function getCustomIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomIndexSma(_index, _startTimestamp, _endTimestamp);
    }

    /**
     * @notice Get latest price of asset
     *
     * @param _index Index of the observation, the index base token mapping
     */
    function getLastPrice(uint256 _index) public view returns (uint256 underlyingLastPrice) {
        IndexObservation[] storage observations = observationsByIndex[_index];
        uint256 index = observations.length - 1;
        underlyingLastPrice = observations[index].underlyingPrice;
    }

    /**
     * @notice Get index count of assets
     */
    function getIndexCount() external view returns (uint256) {
        return _indexCount;
    }

    function getLastUpdatedTimestamp(uint256 _index) external view returns (uint256 lastUpdatedTimestamp) {
        IndexObservation[] storage observations = observationsByIndex[_index];
        lastUpdatedTimestamp = observations[observations.length - 1].timestamp;
    }

    function getIndexObservation(uint256 _index) external view returns (uint256 length) {
        IndexObservation[] storage observations = observationsByIndex[_index];
        length = observations.length;
    }
    function getIndexPriceByEpoch(uint256 _index) external view returns (uint256 length) {
        IndexPriceByEpoch[] storage epochs = indexPriceAtEpochs[_index];
        length = epochs.length;
    }

    function _addAssets(
        uint256[] calldata _underlyingPrices,
        address[] calldata _assets,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) internal {
        uint256 underlyingPriceLength = _underlyingPrices.length;
        require(underlyingPriceLength == _assets.length, "IndexPriceOracle: Unequal length of prices & assets");

        for (uint256 index; index < underlyingPriceLength; index++) {
            require(_assets[index] != address(0), "IndexPriceOracle: Asset address can't be 0");
        }

        IndexObservation memory observation;
        uint256 indexCount = _indexCount;
        uint256 currentTimestamp = block.timestamp;
        for (uint256 index; index < underlyingPriceLength; index++) {
            observation = IndexObservation({ timestamp: currentTimestamp, underlyingPrice: _underlyingPrices[index], proofHash: _proofHash[index] });
            baseTokenByIndex[indexCount] = _assets[index];
            indexByBaseToken[_assets[index]] = indexCount;
            volatilityCapRatioByIndex[indexCount] = _capRatio[index];
            IndexObservation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }
        _indexCount = indexCount;

        emit AssetsAdded(_indexCount, _assets, _underlyingPrices);
    }

    function _pushOrderPrice(
        uint256 _index,
        uint256 _underlyingPrice,
        bytes32 _proofHash
    ) internal {
        IndexObservation memory observation = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
        IndexObservation[] storage observations = observationsByIndex[_index];
        observations.push(observation);
    }

    function _saveEpoch(uint256 _index, uint256 _price) internal {
        uint256 currentTimestamp = block.timestamp;
        IndexPriceByEpoch[] memory indexPriceByEpoch = indexPriceAtEpochs[_index];
        uint256 currentEpochIndex = indexPriceByEpoch.length;
        
        if ((currentTimestamp - initialTimestamp) / indexSmInterval > currentEpochIndex || currentEpochIndex == 0) {
            if (currentEpochIndex != 0 && (currentTimestamp - indexPriceByEpoch[currentEpochIndex - 1].timestamp) / indexSmInterval == 0) {
                _updatePriceEpoch(_index, currentEpochIndex - 1, indexPriceByEpoch[currentEpochIndex - 1].price, _price, indexPriceByEpoch[currentEpochIndex - 1].timestamp);
            } else {
                IndexPriceByEpoch[] storage indexPriceEpoch = indexPriceAtEpochs[_index];
                indexPriceEpoch.push(IndexPriceByEpoch({price: _price, timestamp: currentTimestamp}));
                cardinality = 1;
            }
        } else {
            _updatePriceEpoch(_index, currentEpochIndex - 1, indexPriceByEpoch[currentEpochIndex - 1].price, _price, indexPriceByEpoch[currentEpochIndex - 1].timestamp);
        }
    }

    function _updatePriceEpoch(uint256 _index, uint256 _epochIndex, uint256 _previousPrice, uint256 _price, uint256 _timestamp) private {
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        IndexPriceByEpoch[] storage indexPriceEpoch = indexPriceAtEpochs[_index];
        indexPriceEpoch[_epochIndex] = IndexPriceByEpoch({
            price: actualPrice,
            timestamp: _timestamp
        });
        ++cardinality;
    }

    function _getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) internal view returns (uint256 price, uint256 timestamp) {
        IndexPriceByEpoch[] storage indexPriceByEpoch = indexPriceAtEpochs[_index];
        uint256 currentEpochIndex = indexPriceByEpoch.length;
        if (currentEpochIndex != 0) {
            for (; currentEpochIndex != 0 && indexPriceByEpoch[currentEpochIndex - 1].timestamp >= _epochTimestamp; currentEpochIndex--) {}
            price = indexPriceByEpoch[currentEpochIndex - 1].price;
            timestamp = indexPriceByEpoch[currentEpochIndex - 1].timestamp;
        } else {
            return (0, 0);
        }
    }

    function _getCustomIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastUpdatedTimestamp) {
        IndexObservation[] storage observations = observationsByIndex[_index];
        uint256 index = observations.length;
        lastUpdatedTimestamp = observations[index - 1].timestamp;
        _endTimestamp = lastUpdatedTimestamp < _endTimestamp ? lastUpdatedTimestamp : _endTimestamp;
        if (lastUpdatedTimestamp < _startTimestamp) {
            _startTimestamp = _endTimestamp - indexSmInterval;
        }

        uint256 priceCount;
        for (; index != 0 && observations[index - 1].timestamp >= _startTimestamp; index--) {
            if (observations[index - 1].timestamp <= _endTimestamp) {
                priceCumulative += observations[index - 1].underlyingPrice;
                priceCount++;
            }
        }
        priceCumulative = priceCumulative != 0 ? priceCumulative / priceCount : 0;
    }

    function _requireOracleAdmin() internal view {
        require(hasRole(PRICE_ORACLE_ADMIN, _msgSender()), "IndexPriceOracle: not admin");
    }

    function _requireCanAddObservation() internal view {
        require(hasRole(ADD_OBSERVATION_ROLE, _msgSender()), "IndexPriceOracle: not observation adder");
    }

    function _requireInitialTimestampRole() internal view {
        require(hasRole(INITIAL_TIMESTAMP_ROLE, _msgSender()), "IndexPriceOracle: not first interval adder");
    }
}
