// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { AggregatorV3Interface } from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

contract PerpetualOracle is AccessControlUpgradeable, IPerpetualOracle {
    using LibSafeCastUint for uint256;
    using LibPerpMath for int256;
    uint256 private constant _MAX_ALLOWED_EPOCHS = 1094;
    uint256 private constant _MAX_ALLOWED_OBSERVATIONS = 65535;
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    bytes32 public constant ADD_MARK_OBSERVATION_ROLE = keccak256("ADD_MARK_OBSERVATION_ROLE");
    bytes32 public constant ADD_INDEX_OBSERVATION_ROLE = keccak256("ADD_INDEX_OBSERVATION_ROLE");
    bytes32 public constant FUNDING_PERIOD_ROLE = keccak256("FUNDING_PERIOD_ROLE");
    bytes32 public constant SMA_INTERVAL_ROLE = keccak256("SMA_INTERVAL_ROLE");
    bytes32 public constant CACHE_CHAINLINK_PRICE_UPDATE_ROLE = keccak256("CACHE_CHAINLINK_PRICE_UPDATE_ROLE");
    bytes32 public constant CHAINLINK_TOKEN_ID = bytes32(uint256(2 ** 255)); // CHAINLINK_TOKEN_ID = 0x8000000000000000000000000000000000000000000000000000000000000000 id for chain link base token indexes
    uint256 internal _indexCount;

    mapping(uint256 => address) public baseTokenByIndex;
    mapping(address => uint256) public indexByBaseToken;
    mapping(uint256 => IndexObservation[_MAX_ALLOWED_OBSERVATIONS]) public indexObservations; // since index  is started from zero
    mapping(uint256 => LastPriceObservation[_MAX_ALLOWED_OBSERVATIONS]) public lastPriceObservations; // since index  is started from zero
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS]) public indexEpochs; // since index  is started from zero
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS]) public markEpochs; // since index  is started from zero
    mapping(uint256 => uint256) public lastestMarkPrice;
    mapping(uint256 => uint256) public lastPriceTotalObservations;
    mapping(uint256 => uint256) public indexTotalObservations;
    mapping(uint256 => uint256) public currentIndexEpochEndTimestamp;
    mapping(uint256 => uint256) public currentMarkEpochEndTimestamp;
    mapping(uint256 => uint256) public markPriceEpochsCount;
    mapping(uint256 => uint256) public indexPriceEpochsCount;
    mapping(uint256 => uint256) public initialTimestamps;
    mapping(uint256 => address) public chainlinkAggregatorByIndex;
    uint256 public smInterval;
    uint256 public markSmInterval;
    uint256 public fundingPeriod;
    IPositioning public positioning;

    function __PerpetualOracle_init(
        address[2] calldata _baseToken,
        uint256[2] calldata _lastPrices,
        uint256[2] calldata _indexPrices,
        bytes32[2] calldata _proofHashes,
        address _admin
    ) external initializer {
        uint256 indexCount;
        for (; indexCount < 2; ++indexCount) {
            baseTokenByIndex[indexCount] = _baseToken[indexCount];
            indexByBaseToken[_baseToken[indexCount]] = indexCount;
            lastPriceObservations[indexCount][0] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _lastPrices[indexCount] });
            lastestMarkPrice[indexCount] = _lastPrices[indexCount];
            ++lastPriceTotalObservations[indexCount];

            indexObservations[indexCount][0] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _indexPrices[indexCount], proofHash: _proofHashes[indexCount] });
            ++indexTotalObservations[indexCount];
        }
        _indexCount = indexCount; // = 2
        fundingPeriod = 8 hours;
        smInterval = 8 hours;
        markSmInterval = 300;
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
    }

    function setPositioning(IPositioning _positioning) external virtual {
        _requireOracleAdmin();
        positioning = _positioning;
    }

    function setMarkObservationAdder(address _adder) external virtual {
        _requireOracleAdmin();
        require(_adder != address(0), "PerpOracle: zero address");
        _grantRole(ADD_MARK_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    function setIndexObservationAdder(address _adder) external virtual {
        _requireOracleAdmin();
        require(_adder != address(0), "PerpOracle: zero address");
        _grantRole(ADD_INDEX_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    function grantFundingPeriodRole(address _account) external virtual {
        _requireOracleAdmin();
        require(_account != address(0), "PerpOracle: zero address");
        _grantRole(FUNDING_PERIOD_ROLE, _account);
    }

    function grantSmaIntervalRole(address _positioningConfig) external virtual {
        _requireOracleAdmin();
        _grantRole(SMA_INTERVAL_ROLE, _positioningConfig);
    }

    function grantCacheChainlinkPriceUpdateRole(address _chainlinkPriceFeeder) external virtual {
        _requireOracleAdmin();
        _grantRole(CACHE_CHAINLINK_PRICE_UPDATE_ROLE, _chainlinkPriceFeeder); // This role should be granted to positoning contract as well as to trusted address
    }

    function setFundingPeriod(uint256 _period) external virtual {
        _requireFundingPeriodRole();
        fundingPeriod = _period;
    }

    function setMarkSmInterval(uint256 _markSmInterval) external virtual {
        _requireSmaIntervalRole();
        markSmInterval = _markSmInterval;
    }

    function addMarkObservation(uint256 _index, uint256 _price) external virtual {
        _requireAddMarkObservationRole();
        require(_price != 0, "PerpOracle: zero price");
        _pushLastPrice(_index, _price);
        uint256 _markPrice = _calculateMarkPrice(baseTokenByIndex[_index], _index).abs();
        lastestMarkPrice[_index] = _markPrice;
        _saveEpoch(_index, _markPrice, true);
        emit MarkObservationAdded(_index, _price, _markPrice, block.timestamp);
    }

    function addIndexObservations(uint256[] memory _indexes, uint256[] memory _prices, bytes32[] memory _proofHashes) external virtual {
        _requireAddIndexObservationRole();
        uint256 numberOfPrices = _prices.length;
        for (uint256 index; index < numberOfPrices; ++index) {
            require(_prices[index] != 0, "PerpOracle: zero price");
            _pushIndexPrice(_indexes[index], _prices[index], _proofHashes[index]);
            if (initialTimestamps[_indexes[index]] > 0) {
                _saveEpoch(_indexes[index], _prices[index], false);
            }
        }
        emit IndexObservationAdded(_indexes, _prices, block.timestamp);
    }

    function cacheChainlinkPrice(uint256 _baseTokenIndex) external virtual {
        _requireCacheChainlinkPriceUpdateRole();
        require(isChainlinkToken(_baseTokenIndex), "PerpOracle: invalid chainlink base token index");
        (uint80 roundId, int256 answer, , , ) = AggregatorV3Interface(chainlinkAggregatorByIndex[_baseTokenIndex]).latestRoundData();
        bytes32 proofHash = bytes32(roundId + block.timestamp);
        uint256 price10x6 = uint256(answer) / 100; // Since  prices comes in 8 decimals so need to convert them to 6 (10^6 / 10^8 = 100)
        _pushIndexPrice(_baseTokenIndex, price10x6, proofHash);
        if (initialTimestamps[_baseTokenIndex] > 0) {
            _saveEpoch(_baseTokenIndex, price10x6, false);
        }
        emit ChainlinkPriceAdded(_baseTokenIndex, price10x6, block.timestamp);
    }

    function addChainlinkBaseToken(uint256 _baseTokenIndex, address _chainlinkAggregatorArg, address _baseTokenArgs) external virtual {
        _requireOracleAdmin();
        require(isChainlinkToken(_baseTokenIndex), "PerpOracle: invalid chainlink base token index");
        indexByBaseToken[_baseTokenArgs] = _baseTokenIndex;
        baseTokenByIndex[_baseTokenIndex] = _baseTokenArgs;
        chainlinkAggregatorByIndex[_baseTokenIndex] = _chainlinkAggregatorArg;
        emit ChainlinkBaseTokenAdded(_baseTokenIndex, _baseTokenArgs, _chainlinkAggregatorArg);
    }

    function latestIndexPrice(uint256 _index) public view returns (uint256 indexPrice) {
    }

    function latestIndexSMA(uint256 _smInterval, uint256 _index) external view virtual override returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (answer, lastUpdateTimestamp) = _getIndexSma(_index, startTimestamp, block.timestamp);
    }

    function latestMarkPrice(uint256 _index) public view override returns (uint256 _lastestMarkPrice) {
        _lastestMarkPrice = lastestMarkPrice[_index];
    }

    function lastestTimestamp(uint256 _index, bool isLastPrice) external view returns (uint256 timestamp) {
        if (isLastPrice) {
            LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
            uint256 currentIndex = _getCurrentIndex(_index, true);
            timestamp = observations[currentIndex].timestamp;
        } else {
            uint256 currentIndex = _getCurrentIndex(_index, false);
            IndexObservation[65535] storage observations = indexObservations[_index];
            timestamp = observations[currentIndex].timestamp;
        }
    }

    function lastestLastPriceSMA(uint256 _index, uint256 _smInterval) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (priceCumulative, ) = _getLastPriceSma(_index, startTimestamp, block.timestamp);
    }

    function latestLastPrice(uint256 _index) public view returns (uint256 lastPrice) {
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 currentIndex = _getCurrentIndex(_index, true);
        lastPrice = observations[currentIndex].lastPrice;
    }

    function getLatestBaseTokenPrice(uint256[] memory indexes) public view returns (Price[] memory) {
        Price[] memory prices = new Price[](indexes.length);

        for (uint256 i = 0; i < indexes.length; i++) {
            uint256 indexPrice = latestIndexPrice(indexes[i]);
            uint256 markPrice = latestMarkPrice(indexes[i]);
            uint256 lastPrice = latestLastPrice(indexes[i]);

            Price memory price = Price({ indexPrice: indexPrice, markPrice: markPrice, lastPrice: lastPrice });

            prices[i] = price;
        }

        return prices;
    }

    function getIndexEpochSMA(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) external view returns (uint256 price) {
        price = _getEpochSMA(_index, _startTimestamp, _endTimestamp, false);
    }

    function getMarkEpochSMA(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) external view returns (uint256 price) {
        price = _getEpochSMA(_index, _startTimestamp, _endTimestamp, true);
    }

    function _pushLastPrice(uint256 _index, uint256 _price) internal {
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 totalObservations = lastPriceTotalObservations[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _price });
        ++lastPriceTotalObservations[_index];
        if (totalObservations == 1) {
            initialTimestamps[_index] = block.timestamp;
        }
    }

    function _pushIndexPrice(uint256 _index, uint256 _underlyingPrice, bytes32 _proofHash) internal {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = indexTotalObservations[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
        ++indexTotalObservations[_index];
    }

    function _saveEpoch(uint256 _index, uint256 _price, bool _isMark) internal {
        uint256 currentTimestamp = block.timestamp;
        (uint256 totalEpochs, PriceEpochs[_MAX_ALLOWED_EPOCHS] storage priceEpoch, uint256 endTimestamp) = _isMark
            ? (markPriceEpochsCount[_index], markEpochs[_index], currentMarkEpochEndTimestamp[_index])
            : (indexPriceEpochsCount[_index], indexEpochs[_index], currentIndexEpochEndTimestamp[_index]);
        uint256 currentEpochIndex;
        if (totalEpochs < _MAX_ALLOWED_EPOCHS) {
            currentEpochIndex = totalEpochs != 0 ? totalEpochs - 1 : 0;
        } else {
            currentEpochIndex = totalEpochs % _MAX_ALLOWED_EPOCHS;
            currentEpochIndex = currentEpochIndex != 0 ? currentEpochIndex - 1 : _MAX_ALLOWED_EPOCHS - 1;
        }

        if (currentTimestamp <= endTimestamp) {
            _updatePriceEpoch(
                currentEpochIndex,
                priceEpoch[currentEpochIndex].price,
                _price,
                priceEpoch[currentEpochIndex].timestamp,
                priceEpoch[currentEpochIndex].cardinality,
                priceEpoch
            );
        } else {
            currentEpochIndex = totalEpochs != 0 ? currentEpochIndex + 1 != _MAX_ALLOWED_EPOCHS ? currentEpochIndex + 1 : 0 : 0; // Note: Recheck again
            priceEpoch[currentEpochIndex] = PriceEpochs({ price: _price, timestamp: currentTimestamp, cardinality: 1 });
            uint256 epochEndTimestamp = initialTimestamps[_index] + (((currentTimestamp - initialTimestamps[_index]) / smInterval) + 1) * smInterval;
            if (_isMark) {
                ++markPriceEpochsCount[_index];
                currentMarkEpochEndTimestamp[_index] = epochEndTimestamp;
            } else {
                ++indexPriceEpochsCount[_index];
                currentIndexEpochEndTimestamp[_index] = epochEndTimestamp;
            }
        }
    }

    function _updatePriceEpoch(uint256 _epochIndex, uint256 _previousPrice, uint256 _price, uint256 _timestamp, uint256 cardinality, PriceEpochs[1094] storage priceEpoch) private {
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        uint256 updatedTimestamp = (_timestamp * cardinality + block.timestamp) / (cardinality + 1);
        priceEpoch[_epochIndex] = PriceEpochs({ price: actualPrice, timestamp: updatedTimestamp, cardinality: cardinality + 1 });
    }

    function _calculateMarkPrice(address _baseToken, uint256 _index) internal view returns (int256 markPrice) {
        int256 lastFundingRate = positioning.getLastFundingRate(_baseToken);
        uint256 nextFunding = positioning.getNextFunding(_baseToken);

        int256[3] memory prices;
        int256 indexPrice = latestIndexPrice(_index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        uint256 lastPriceSma = lastestLastPriceSMA(_index, markSmInterval);
        prices[1] = lastPriceSma.toInt256();
        prices[2] = latestMarkPrice(_index).toInt256();
        markPrice = prices[0].median(prices[1], prices[2]);
    }

    function _getLastPriceSma(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        require(_endTimestamp > _startTimestamp, "PerpOracle: invalid timestamp");
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 totalObservations = lastPriceTotalObservations[_index];
        if (totalObservations == 1) {
            return (observations[0].lastPrice, observations[0].timestamp);
        }
        uint256 currentIndex = _getCurrentAllowedIndex(_MAX_ALLOWED_OBSERVATIONS, totalObservations);
        lastTimestamp = observations[currentIndex].timestamp;
        if (lastTimestamp < _startTimestamp) return (0, 0);
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        uint256 priceCount;

        uint256 index = currentIndex;
        for (; observations[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_OBSERVATIONS - 1 : index - 1) {
            if ((priceCount > 0 && currentIndex == index) || (index == 0 && totalObservations < _MAX_ALLOWED_OBSERVATIONS)) {
                break;
            }
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].lastPrice;
                priceCount++;
            }
        }
        priceCumulative = priceCumulative != 0 ? priceCumulative / priceCount : observations[currentIndex].timestamp;
    }

    function _getIndexSma(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        require(_endTimestamp > _startTimestamp, "PerpOracle: invalid timestamp");
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = indexTotalObservations[_index];
        if (totalObservations == 1) {
            return (observations[0].underlyingPrice, observations[0].timestamp);
        }
        uint256 currentIndex = _getCurrentAllowedIndex(_MAX_ALLOWED_OBSERVATIONS, totalObservations);
        lastTimestamp = observations[currentIndex].timestamp;
        if (lastTimestamp < _startTimestamp) return (0, 0);
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;

        uint256 priceCount;
        uint256 index = currentIndex;
        for (; observations[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_OBSERVATIONS - 1 : index - 1) {
            if ((priceCount > 0 && currentIndex == index) || (index == 0 && totalObservations < _MAX_ALLOWED_OBSERVATIONS)) {
                break;
            }
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].underlyingPrice;
                priceCount++;
            }
        }

        priceCumulative = priceCount != 0 ? priceCumulative / priceCount : 0;
    }

    function _getEpochSMA(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp, bool _isMark) internal view returns (uint256 priceCumulative) {
        require(_endTimestamp > _startTimestamp, "PerpOracle: invalid timestamp");
        PriceEpochs[_MAX_ALLOWED_EPOCHS] storage priceEpochs = _isMark ? markEpochs[_index] : indexEpochs[_index];
        uint256 totalEpochs = _isMark ? markPriceEpochsCount[_index] : indexPriceEpochsCount[_index];
        if (totalEpochs == 0) {
            return _isMark ? latestLastPrice(_index) : 0; // Note: mark or last price should be used instead of zero price
        }
        uint256 currentIndex = _getCurrentAllowedIndex(_MAX_ALLOWED_EPOCHS, totalEpochs);
        uint256 lastTimestamp = priceEpochs[currentIndex].timestamp;
        if (lastTimestamp == 0) return (0);
        if (lastTimestamp < _startTimestamp) {
            if (_isMark) {
                _startTimestamp = initialTimestamps[_index] + (((lastTimestamp - initialTimestamps[_index]) / smInterval) * smInterval); // For mark, it is expected that mark price should not be zero
            } else {
                return (0);
            }
        }
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        uint256 priceCount;
        uint256 index = currentIndex;
        for (; priceEpochs[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_EPOCHS - 1 : index - 1) {
            // TODO: Move under the logic of for loop to a private method, search in ala methods for redundant part
            if ((priceCount > 0 && currentIndex == index) || (totalEpochs < _MAX_ALLOWED_EPOCHS && index == _MAX_ALLOWED_EPOCHS - 1)) {
                break;
            }
            if (priceEpochs[index].timestamp <= _endTimestamp) {
                priceCumulative += priceEpochs[index].price;
                priceCount++;
            }
        }
        priceCumulative = priceCount != 0 ? priceCumulative / priceCount : 0;
    }

    function _getCurrentIndex(uint256 _index, bool _isLastPrice) internal view returns (uint256 currentIndex) {
        uint256 nextIndex;
        uint256 totalObservations;
        if (_isLastPrice) {
            totalObservations = lastPriceTotalObservations[_index];
            nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            nextIndex = nextIndex != 0 ? nextIndex : _MAX_ALLOWED_OBSERVATIONS - 1;
        } else {
            totalObservations = indexTotalObservations[_index];
            nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            nextIndex = nextIndex != 0 ? nextIndex : _MAX_ALLOWED_OBSERVATIONS - 1;
        }
        currentIndex = nextIndex - 1;
    }

    function _getCurrentAllowedIndex(uint256 _maxAllowedDataPoints, uint256 _totalObservations) private pure returns (uint256 currentIndex) {
        if (_totalObservations < _maxAllowedDataPoints) {
            currentIndex = _totalObservations != 0 ? _totalObservations - 1 : 0;
        } else {
            uint256 remainder = _totalObservations % _maxAllowedDataPoints;
            currentIndex = remainder != 0 ? remainder - 1 : _maxAllowedDataPoints - 1;
        }
    }

    function _requireOracleAdmin() internal view {
        require(hasRole(PRICE_ORACLE_ADMIN, _msgSender()), "PerpOracle: not admin");
    }

    function _requireAddMarkObservationRole() internal view {
        require(hasRole(ADD_MARK_OBSERVATION_ROLE, _msgSender()), "PerpOracle: not mark observation adder");
    }

    function _requireAddIndexObservationRole() internal view {
        require(hasRole(ADD_INDEX_OBSERVATION_ROLE, _msgSender()), "PerpOracle: not index observation adder");
    }

    function _requireFundingPeriodRole() internal view {
        require(hasRole(FUNDING_PERIOD_ROLE, _msgSender()), "PerpOracle: not funding period role");
    }

    function _requireSmaIntervalRole() internal view {
        require(hasRole(SMA_INTERVAL_ROLE, _msgSender()), "MarkPriceOracle: not sma interval role");
    }

    function _requireCacheChainlinkPriceUpdateRole() internal view {
        require(hasRole(CACHE_CHAINLINK_PRICE_UPDATE_ROLE, _msgSender()), "PerpOracle: not chain link price adder");
    }

    function isChainlinkToken(uint256 baseTokenIndex) internal view returns (bool) {
        return ((uint256(CHAINLINK_TOKEN_ID & bytes32(baseTokenIndex)) >> 255) == 1);
    }
}
