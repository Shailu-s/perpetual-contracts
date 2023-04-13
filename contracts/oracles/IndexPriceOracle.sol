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
    uint256 public indexTwInterval; // interval for twap calculation
    uint256 public lastUpdatedEndTimestamp; // timestamp of last calculated epoch's end timestamp
    uint256 public currentEpochPriceCount; // number of prices used to calculate current epoch's average price

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint256 indexed index, uint256 underlyingPrice, uint256 timestamp);
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
        indexTwInterval = 8 hours;
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        _addAssets(_volatilityPrices, _volatilityIndex, _proofHash, _capRatio);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
        __ERC165Storage_init();
        _registerInterface(_IVOLMEX_ORACLE_ID);
        lastUpdatedEndTimestamp = block.timestamp;
    }

    function grantInitialTimestampRole(address _account) external {
        _requireOracleAdmin();
        _grantRole(INITIAL_TIMESTAMP_ROLE, _account);
    }

    /**
     * @param _twInterval Time in seconds
     */
    function setIndextwInterval(uint256 _twInterval) external {
        _requireOracleAdmin();
        indexTwInterval = _twInterval;
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _underlyingPrice Price of the asset
     * @param _index position of the asset
     * @param _underlyingPrice hash of price collection
     */
    function addObservation(
        uint256 _underlyingPrice,
        uint256 _index,
        bytes32 _proofHash
    ) external virtual {
        _requireCanAddObservation();
        require(_underlyingPrice != 0, "IndexPriceOracle: Not zero");
        _pushOrderPrice(_index, _underlyingPrice, _proofHash);
        _storePartEpochPrice(_index, _underlyingPrice);
        emit ObservationAdded(_index, _underlyingPrice, block.timestamp);
    }

    function getLastEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, block.timestamp);
    }

    function getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, _epochTimestamp);
    }

    /**
     * @notice Emulate the Chainlink Oracle interface for retrieving Volmex TWAP volatility index
     * @param _index Datapoints volatility index id {0}
     * @param _twInterval time for averaging observations
     * @return answer is the answer for the given round
     */
    function latestRoundData(uint256 _twInterval, uint256 _index) external view virtual returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _twInterval;
        (answer, lastUpdateTimestamp) = _getCustomIndexTwap(_index, startTimestamp, block.timestamp);
        answer *= 100;
    }

    /**
     * @notice Get volatility indices price of normal and inverse with last timestamp
     * @param _twInterval time interval for twap
     * @param _index Position of the observation
     */
    function getIndexTwap(uint256 _twInterval, uint256 _index)
        external
        view
        returns (
            uint256 volatilityTokenTwap,
            uint256 iVolatilityTokenTwap,
            uint256 lastUpdateTimestamp
        )
    {
        uint256 startTimestamp = block.timestamp - _twInterval;
        (volatilityTokenTwap, lastUpdateTimestamp) = _getCustomIndexTwap(_index, startTimestamp, block.timestamp);
        iVolatilityTokenTwap = volatilityCapRatioByIndex[_index] - volatilityTokenTwap;
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
     * @param _twInterval Time in seconds of the range
     * @param _index Index of the observation, the index base token mapping
     * @return priceCumulative The SMA price of the asset
     */
    function getLastTwap(uint256 _twInterval, uint256 _index) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _twInterval;
        (priceCumulative,) = _getCustomIndexTwap(_index, startTimestamp, block.timestamp);
    }

    /**
     * @notice Get price cumulative of custom window of the observations
     *
     * @param _index Position of the asset in Observations
     * @param _startTimestamp timestamp of start of window
     * @param _endTimestamp timestamp of last of window
     */
    function getCustomIndexTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomIndexTwap(_index, _startTimestamp, _endTimestamp);
    }

    /**
     * @notice Get latest price of asset
     *
     * @param _index Index of the observation, the index base token mapping
     */
    function getLastPrice(uint256 _index) public view returns (uint256 underlyingLastPrice) {
        IndexObservation[] memory observations = observationsByIndex[_index];
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
        IndexObservation[] memory observations = observationsByIndex[_index];
        lastUpdatedTimestamp = observations[observations.length - 1].timestamp;
    }

    function getLastEpochTwap(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getLastEpochTwap(_index);
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

    function _storePartEpochPrice(uint256 _index, uint256 _price) internal {
        uint256 currentTimestamp = block.timestamp;
        if (currentTimestamp - lastUpdatedEndTimestamp > indexTwInterval) {
            lastUpdatedEndTimestamp = currentTimestamp;
            currentEpochPriceCount = 0;
        }
        IndexPriceByEpoch[] memory indexPriceByEpoch = indexPriceAtEpochs[_index];
        uint256 totalEpochs = indexPriceByEpoch.length;
        IndexPriceByEpoch[] storage indexPriceEpoch = indexPriceAtEpochs[_index];
        if (totalEpochs == 0 || currentEpochPriceCount == 0) {
            indexPriceEpoch.push(IndexPriceByEpoch({price: _price, timestamp: currentTimestamp}));
        } else {
            uint256 actualPrice = (indexPriceByEpoch[totalEpochs - 1].price * currentEpochPriceCount + _price) / (currentEpochPriceCount + 1);
            indexPriceEpoch[totalEpochs - 1] = IndexPriceByEpoch({
                price: actualPrice,
                timestamp: currentTimestamp
            });
        }
        ++currentEpochPriceCount;
    }

    function _getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) internal view returns (uint256 price, uint256 timestamp) {
        IndexPriceByEpoch[] memory indexPriceByEpoch = indexPriceAtEpochs[_index];
        uint256 totalEpochs = indexPriceByEpoch.length;
        if (totalEpochs != 0) {
            for (; totalEpochs != 0 && indexPriceByEpoch[totalEpochs - 1].timestamp >= _epochTimestamp; totalEpochs--) {}
            price = indexPriceByEpoch[totalEpochs].price;
            timestamp = indexPriceByEpoch[totalEpochs].timestamp;
        } else {
            return (0, 0);
        }
    }

    function _getCustomIndexTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastUpdatedTimestamp) {
        IndexObservation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length;
        lastUpdatedTimestamp = observations[index - 1].timestamp;
        _endTimestamp = lastUpdatedTimestamp < _endTimestamp ? lastUpdatedTimestamp : _endTimestamp;

        uint256 priceCount;
        for (; index != 0 && observations[index - 1].timestamp >= _startTimestamp; index--) {
            if (observations[index - 1].timestamp <= _endTimestamp) {
                priceCumulative += observations[index - 1].underlyingPrice;
                priceCount++;
            }
        }
        priceCumulative = priceCumulative / priceCount;
    }

    /**
     * @notice Fetch index price of last epoch
     * 
     * @param _index Index of the observation, the index base token mapping
     */
    function _getLastEpochTwap(uint256 _index) internal view returns (uint256 price, uint256 timestamp) {
        IndexPriceByEpoch[] memory indexPriceByEpoch = indexPriceAtEpochs[_index];
        uint256 length = indexPriceByEpoch.length;
        price = length != 0 ? indexPriceByEpoch[length - 1].price : getLastPrice(_index);
        timestamp = length != 0 ? indexPriceByEpoch[length - 1].timestamp : block.timestamp;
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
