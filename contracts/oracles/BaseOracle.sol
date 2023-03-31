// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract BaseOracle is AccessControlUpgradeable {
    struct Observation {
        uint256 timestamp;
        uint256 underlyingPrice;
        bytes32 proofHash;
    }

    // price oracle admin role
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    // role of observation collection
    bytes32 public constant CAN_ADD_OBSERVATION = keccak256("CAN_ADD_OBSERVATION");

    // indices of volatility index {0: ETHV, 1: BTCV}
    uint256 internal _indexCount;
    // mapping to store index to the address of the baseToken
    mapping(uint256 => address) public baseTokenByIndex;
    // mapping to store index by base token address
    mapping(address => uint256) public indexByBaseToken;
    // mapping to store baseToken to Observations
    mapping(uint256 => Observation[]) public observationsByIndex;
    // Store the volatilitycapratio by index
    mapping(uint256 => uint256) public volatilityCapRatioByIndex;

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint256 index, uint256 underlyingPrice, uint256 timestamp);
    event AssetsAdded(uint256 indexed lastIndex, address[] assets, uint256[] underlyingPrices);

    /**
     * @notice Initialize the contract
     *
     * @param _underlyingPrice Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function _BaseOracle_init(
        uint256[] calldata _underlyingPrice,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) internal onlyInitializing {
        _addAssets(_underlyingPrice, _asset, _proofHash, _capRatio);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
    }

    /**
     * @notice Set price observation collector
     *
     * @param _adder Address of price collector
     */
    function setObservationAdder(address _adder) external {
        _requireOracleAdmin();
        require(_adder != address(0), "BaseOracle: zero address");
        _grantRole(CAN_ADD_OBSERVATION, _adder);
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
    function getCumulativePrice(uint256 _twInterval, uint256 _index) external view returns (uint256 priceCumulative) { // TODO: getLastPriceTwap, call get custom window method and pass end time as current time
        (priceCumulative, ) = _getCumulativePrice(_twInterval, _index);
    }

    /**
     * @notice Get price cumulative of custom window of the observations
     *
     * @param _index Position of the asset in Observations
     * @param _startTimestamp timestamp of start of window
     * @param _endTimestamp timestamp of last of window
     */
    function getCustomCumulativePrice(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) external view returns (uint256 priceCumulative) { // TODO:
        priceCumulative = _getCustomCumulativePrice(_index, _startTimestamp, _endTimestamp);
    }

    /**
     * @notice Get latest price of asset
     *
     * @param _index Index of the observation, the index base token mapping
     */
    function getLastPrice(uint256 _index) public view returns (uint256 underlyingLastPrice) { // TODO: getLastPrice
        Observation[] memory observations = observationsByIndex[_index];
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
        Observation[] memory observations = observationsByIndex[_index];
        lastUpdatedTimestamp = observations[observations.length - 1].timestamp;
    }

    function _addAssets(
        uint256[] calldata _underlyingPrices,
        address[] calldata _assets,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) internal {
        uint256 underlyingPriceLength = _underlyingPrices.length;
        require(underlyingPriceLength == _assets.length, "BaseOracle: Unequal length of prices & assets");

        for (uint256 index; index < underlyingPriceLength; index++) {
            require(_assets[index] != address(0), "BaseOracle: Asset address can't be 0");
        }

        Observation memory observation;
        uint256 indexCount = _indexCount;
        uint256 currentTimestamp = block.timestamp;
        for (uint256 index; index < underlyingPriceLength; index++) {
            observation = Observation({ timestamp: currentTimestamp, underlyingPrice: _underlyingPrices[index], proofHash: _proofHash[index] });
            baseTokenByIndex[indexCount] = _assets[index];
            indexByBaseToken[_assets[index]] = indexCount;
            volatilityCapRatioByIndex[indexCount] = _capRatio[index];
            Observation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }
        _indexCount = indexCount;

        emit AssetsAdded(_indexCount, _assets, _underlyingPrices);
    }

    function _addObservation(
        uint256 _underlyingPrice,
        uint256 _index,
        bytes32 _proofHash
    ) internal {
        require(_underlyingPrice != 0, "BaseOracle: Not zero");
        Observation memory observation = Observation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
        Observation[] storage observations = observationsByIndex[_index];
        observations.push(observation);
        emit ObservationAdded(_index, _underlyingPrice, block.timestamp);
    }

    function _getCumulativePrice(uint256 _twInterval, uint256 _index) internal view returns (uint256 priceCumulative, uint256 lastUpdatedTimestamp) {
        Observation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length;
        lastUpdatedTimestamp = observations[index - 1].timestamp;
        uint256 initialTimestamp = block.timestamp - _twInterval;
        for (; index != 0 && observations[index - 1].timestamp >= initialTimestamp; index--) {
            priceCumulative += observations[index - 1].underlyingPrice;
        }
        priceCumulative = observations.length != index ? priceCumulative / (observations.length - index) : priceCumulative;
    }

    function _getCustomCumulativePrice(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) internal view returns (uint256 priceCumulative) {
        Observation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length;
        uint256 startIndex;
        uint256 endIndex;
        for (; index != 0 && index >= startIndex; index--) {
            if (observations[index - 1].timestamp >= _endTimestamp) {
                endIndex = index - 1;
            } else if (observations[index - 1].timestamp >= _startTimestamp) {
                startIndex = index - 1;
            }
        }
        index = 0; // re-used to get total observation count
        for (; startIndex <= endIndex; startIndex++) {
            priceCumulative += observations[startIndex].underlyingPrice;
            index++;
        }
        priceCumulative = priceCumulative / index;
    }

    function _requireOracleAdmin() internal view {
        require(hasRole(PRICE_ORACLE_ADMIN, _msgSender()), "BaseOracle: not admin");
    }

    function _requireCanAddObservation() internal view {
        require(hasRole(CAN_ADD_OBSERVATION, _msgSender()), "BaseOracle: not observation adder");
    }
}
