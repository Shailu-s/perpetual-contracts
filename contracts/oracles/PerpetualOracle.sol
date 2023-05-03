// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { MathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import { IPositioning } from "../interfaces/IPositioning.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

contract PerpetualOracle is AccessControlUpgradeable {
    using LibSafeCastUint for uint256;
    using LibPerpMath for int256;

    struct IndexObservation {
        uint256 timestamp;
        uint256 underlyingPrice;
        bytes32 proofHash;
    }
    struct LastPriceObservation {
        uint256 timestamp;
        uint256 lastPrice;
    }
    struct PriceEpochs {
        uint256 price;
        uint256 timestamp;
        uint256 cardinality;
    }
    struct EpochInfo {
        uint256 currentCount; // number of elements in current epoch
        uint256 total; // total number of epochs added
    }

    uint256 private constant _MAX_ALLOWED_EPOCHS = 1095;
    uint256 private constant _MAX_ALLOWED_OBSERVATIONS = 65536;
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    bytes32 public constant ADD_MARK_OBSERVATION_ROLE = keccak256("ADD_MARK_OBSERVATION_ROLE");
    bytes32 public constant ADD_INDEX_OBSERVATION_ROLE = keccak256("ADD_INDEX_OBSERVATION_ROLE");
    bytes32 public constant FUNDING_PERIOD_ROLE = keccak256("FUNDING_PERIOD_ROLE");
    bytes32 public constant SMA_INTERVAL_ROLE = keccak256("SMA_INTERVAL_ROLE");

    uint256 internal _indexCount;

    mapping(uint256 => address) public baseTokenByIndex;
    mapping(address => uint256) public indexByBaseToken;
    mapping(uint256 => IndexObservation[_MAX_ALLOWED_OBSERVATIONS - 1]) public indexObservations; // since index will we max allowed observations - 1
    mapping(uint256 => LastPriceObservation[_MAX_ALLOWED_OBSERVATIONS - 1]) public lastPriceObservation;
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS - 1]) public indexEpochs;
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS - 1]) public markEpochs;
    mapping(uint256 => uint256) public lastMarkPrice;
    mapping(uint256 => EpochInfo) public indexEpochInfo;
    mapping(uint256 => EpochInfo) public markEpochInfo;
    mapping(uint256 => uint256) public lastPriceTotalObservation;
    mapping(uint256 => uint256) public indexTotalObservation;
    uint256 public smInterval;
    uint256 public markSmInterval;
    uint256 public initialTimestamp;
    uint256 public fundingPeriod;
    IPositioning public positioning;

    event ObservationAdderSet(address indexed matchingEngine);
    event IndexObservationAdded(uint256[] index, uint256[] underlyingPrice, uint256 timestamp);
    event MarkObservationAdded(uint256 indexed index, uint256 lastPrice, uint256 markPrice, uint256 timestamp);

    function perpetualOraclesInit(
        address[2] calldata _baseToken,
        uint256[2] calldata _markPrices,
        uint256[2] calldata _indexPrices,
        bytes32[2] calldata _proofHashes,
        address _admin
    ) external initializer {
        uint256 indexCount;
        for (; indexCount < 2; ++indexCount) {
            baseTokenByIndex[indexCount] = _baseToken[indexCount];
            indexByBaseToken[_baseToken[indexCount]] = indexCount;
            lastPriceObservation[indexCount][0] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _markPrices[indexCount] });
            ++lastPriceTotalObservation[indexCount];
            indexObservations[indexCount][0] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _indexPrices[indexCount], proofHash: _proofHashes[indexCount] });
            ++indexTotalObservation[indexCount];
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
        _pushMarkOrderPrice(_index, _price);
        uint256 markPrice = _calculateMarkPrice(baseTokenByIndex[_index], _index).abs();
        lastMarkPrice[_index] = markPrice;
        _saveEpoch(_index, _price, true);
        emit MarkObservationAdded(_index, _price, markPrice, block.timestamp);
    }

    function addIndexObservation(
        uint256[] memory _indexes,
        uint256[] memory _prices,
        bytes32[] memory _proofHashes
    ) external virtual {
        _requireAddIndexObservationRole();
        uint256 numberOfPrices = _prices.length;
        for (uint256 index; index < numberOfPrices; ++index) {
            require(_prices[index] != 0, "PerpOracle: zero price");
            _pushIndexOrderPrice(_indexes[index], _prices[index], _proofHashes[index]);
            _saveEpoch(_indexes[index], _prices[index], false);
        }
        emit IndexObservationAdded(_indexes, _prices, block.timestamp);
    }

    function getLastPriceOfIndex(uint256 _index) public view returns (uint256 underlyingLastPrice) {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 currentIndex = _getCurrentIndex(_index, false);
        underlyingLastPrice = observations[currentIndex].underlyingPrice;
    }

    function getLastIndexEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price) = _getCustomEpochPrice(_index, block.timestamp + smInterval, block.timestamp, false);
    }

    function latestRoundData(uint256 _smInterval, uint256 _index) external view virtual returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (answer, lastUpdateTimestamp) = _getCustomIndexSma(_index, startTimestamp, block.timestamp);
        answer *= 100;
    }

    function getLastUpdatedTimestamp(uint256 _index, bool isMark) external view returns (uint256 lastUpdatedTimestamp) {
        if (isMark) {
            LastPriceObservation[65535] storage observations = lastPriceObservation[_index];
            uint256 currentIndex = _getCurrentIndex(_index, true);
            lastUpdatedTimestamp = observations[currentIndex].timestamp;
        } else {
            uint256 currentIndex = _getCurrentIndex(_index, false);
            IndexObservation[65535] storage observations = indexObservations[_index];

            lastUpdatedTimestamp = observations[currentIndex].timestamp;
        }
    }

    function getLastMarkPriceSma(uint256 _index, uint256 _smInterval) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (priceCumulative, ) = _getCustomLastSma(_index, startTimestamp, block.timestamp);
    }

    function getCustomIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) public view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomIndexSma(_index, _startTimestamp, _endTimestamp);
    }

    function getLastMarkPrice(uint256 _index) public view returns (uint256 _lastMarkPrice) {
        _lastMarkPrice = lastMarkPrice[_index];
    }

    function getLastMarkEpochPrice(uint256 _index) external view returns (uint256 price) {
        (price) = _getCustomEpochPrice(_index, block.timestamp - smInterval, block.timestamp, true);
    }

    function getCustomMarkEpochPrice(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price) {
        (price) = _getCustomEpochPrice(_index, _startTimestamp, _endTimestamp, true);
    }

    function getCustomIndexEpochPrice(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price) {
        (price) = _getCustomEpochPrice(_index, _startTimestamp, _endTimestamp, false);
    }

    function _pushMarkOrderPrice(uint256 _index, uint256 _price) internal {
        LastPriceObservation[65535] storage observations = lastPriceObservation[_index];
        uint256 totalObservations = lastPriceTotalObservation[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _price });
        ++lastPriceTotalObservation[_index];

        if (totalObservations == 1) {
            initialTimestamp = block.timestamp;
        }
    }

    function _pushIndexOrderPrice(
        uint256 _index,
        uint256 _underlyingPrice,
        bytes32 _proofHash
    ) internal {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = indexTotalObservation[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
        ++indexTotalObservation[_index];
    }

    function _saveEpoch(
        uint256 _index,
        uint256 _price,
        bool _isMark
    ) internal {
        uint256 currentTimestamp = block.timestamp;
        EpochInfo storage epochInfo = _isMark ? markEpochInfo[_index] : indexEpochInfo[_index];
        PriceEpochs[1094] storage priceEpoch = _isMark ? markEpochs[_index] : indexEpochs[_index];
        uint256 currentEpochIndex;
        if (epochInfo.total < _MAX_ALLOWED_EPOCHS) {
            currentEpochIndex = epochInfo.total != 0 ? epochInfo.total - 1 : 0;
        } else {
            currentEpochIndex = epochInfo.total % _MAX_ALLOWED_EPOCHS;
            currentEpochIndex = currentEpochIndex != 0 ? currentEpochIndex - 1 : _MAX_ALLOWED_EPOCHS - 1;
        }

        if ((currentTimestamp - initialTimestamp) / smInterval > epochInfo.total || epochInfo.total == 0) {
            if (epochInfo.total != 0 && (currentTimestamp - priceEpoch[currentEpochIndex].timestamp) / smInterval == 0) {
                _updatePriceEpoch(currentEpochIndex, priceEpoch[currentEpochIndex].price, _price, priceEpoch[currentEpochIndex].timestamp, epochInfo.currentCount, priceEpoch);
                ++epochInfo.currentCount;
            } else {
                currentEpochIndex = epochInfo.total != 0 ? currentEpochIndex + 1 : 0;
                priceEpoch[currentEpochIndex] = PriceEpochs({ price: _price, timestamp: currentTimestamp, cardinality: 1 });
                epochInfo.currentCount = 1;
                ++epochInfo.total;
            }
        } else {
            _updatePriceEpoch(currentEpochIndex, priceEpoch[currentEpochIndex].price, _price, priceEpoch[currentEpochIndex].timestamp, epochInfo.currentCount, priceEpoch);
            ++epochInfo.currentCount;
        }
    }

    function _updatePriceEpoch(
        uint256 _epochIndex,
        uint256 _previousPrice,
        uint256 _price,
        uint256 _timestamp,
        uint256 cardinality,
        PriceEpochs[1094] storage priceEpoch
    ) private {
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        priceEpoch[_epochIndex] = PriceEpochs({ price: actualPrice, timestamp: _timestamp, cardinality: cardinality + 1 });
    }

    function _calculateMarkPrice(address _baseToken, uint256 _index) internal view returns (int256 markPrice) {
        int256 lastFundingRate = positioning.getLastFundingRate(_baseToken);
        uint256 nextFunding = positioning.getNextFunding(_baseToken);

        int256[3] memory prices;
        int256 indexPrice = getLastPriceOfIndex(_index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        uint256 markSma = getLastMarkPriceSma(_index, markSmInterval);
        prices[1] = markSma.toInt256();
        prices[2] = getLastMarkPrice(_index).toInt256();
        markPrice = prices[0].median(prices[1], prices[2]);
    }

    function _getCustomLastSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        LastPriceObservation[65535] storage observations = lastPriceObservation[_index];
        uint256 totalObservations = lastPriceTotalObservation[_index];
        uint256 currentIndex;
        uint256 startIndex;
        if (totalObservations < _MAX_ALLOWED_OBSERVATIONS) {
            currentIndex = totalObservations != 0 ? totalObservations - 1 : _MAX_ALLOWED_OBSERVATIONS - 1;
        } else {
            uint256 remainder = totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            currentIndex = remainder != 0 ? remainder - 1 : _MAX_ALLOWED_OBSERVATIONS - 1;
            startIndex = remainder;
        }
        lastTimestamp = observations[currentIndex].timestamp;
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        if (lastTimestamp < _startTimestamp) {
            _startTimestamp = observations[0].timestamp + (((lastTimestamp - observations[0].timestamp) / smInterval) * smInterval);
        }
        uint256 priceCount;
        uint256 index = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? currentIndex : startIndex;
        for (; observations[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_OBSERVATIONS - 1 : index - 1) {
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].lastPrice;
                priceCount++;
            }
            if (totalObservations < _MAX_ALLOWED_OBSERVATIONS && index == 0) {
                break;
            }
        }

        priceCumulative = priceCumulative / priceCount;
    }

    function _getCustomIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = observations.length;
        uint256 currentIndex;
        uint256 startIndex;
        if (totalObservations < _MAX_ALLOWED_OBSERVATIONS) {
            currentIndex = totalObservations != 0 ? totalObservations - 1 : _MAX_ALLOWED_OBSERVATIONS - 1;
        } else {
            uint256 remainder = totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            currentIndex = remainder != 0 ? remainder - 1 : _MAX_ALLOWED_OBSERVATIONS - 1;
            startIndex = remainder;
        }
        lastTimestamp = observations[currentIndex].timestamp;
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        if (lastTimestamp < _startTimestamp) {
            _startTimestamp = observations[0].timestamp + (((lastTimestamp - observations[0].timestamp) / smInterval) * smInterval);
        }
        uint256 priceCount;
        uint256 index = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? currentIndex : startIndex;
        for (; observations[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_OBSERVATIONS - 1 : index - 1) {
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].underlyingPrice;
                priceCount++;
            }
            if (totalObservations < _MAX_ALLOWED_OBSERVATIONS && index == 0) {
                break;
            }
        }

        priceCumulative = priceCumulative / priceCount;
    }

    function _getCustomEpochPrice(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp,
        bool _isMark
    ) internal view returns (uint256 price) {
        PriceEpochs[1094] storage priceEpochs = _isMark ? markEpochs[_index] : indexEpochs[_index];
        EpochInfo storage epochInfo = _isMark ? markEpochInfo[_index] : indexEpochInfo[_index];
        uint256 totalEpochs = epochInfo.total;
        uint256 currentIndex;
        uint256 startIndex;
        uint256 priceCumulative;
        if (totalEpochs != 0) {
            if (totalEpochs < _MAX_ALLOWED_EPOCHS) {
                currentIndex = totalEpochs != 0 ? totalEpochs - 1 : _MAX_ALLOWED_EPOCHS - 1;
            } else {
                uint256 remainder = totalEpochs % _MAX_ALLOWED_EPOCHS;
                currentIndex = remainder != 0 ? remainder - 1 : _MAX_ALLOWED_EPOCHS - 1;
                startIndex = remainder;
            }
            uint256 lastTimestamp = priceEpochs[currentIndex].timestamp;
            _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
            if (lastTimestamp < _startTimestamp) {
                _startTimestamp = priceEpochs[0].timestamp + (((lastTimestamp - priceEpochs[0].timestamp) / smInterval) * smInterval);
            }
            uint256 priceCount;
            uint256 index = totalEpochs < _MAX_ALLOWED_EPOCHS ? currentIndex : startIndex;
            for (; priceEpochs[index].timestamp >= _startTimestamp; index = index == 0 ? _MAX_ALLOWED_OBSERVATIONS - 1 : index - 1) {
                if (priceEpochs[index].timestamp <= _endTimestamp) {
                    priceCumulative += priceEpochs[index].price * priceEpochs[index].cardinality;
                    priceCount = priceCount + priceEpochs[index].cardinality;
                }
                if (totalEpochs < _MAX_ALLOWED_EPOCHS && index == 0) {
                    break;
                }
            }

            price = priceCumulative / priceCount;
        }
    }

    function _getCurrentIndex(uint256 _index, bool _isMark) internal view returns (uint256 currentIndex) {
        uint256 nextIndex;
        uint256 totalObservations;
        if (_isMark) {
            totalObservations = lastPriceTotalObservation[_index];
            nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            nextIndex = nextIndex != 0 ? nextIndex : _MAX_ALLOWED_OBSERVATIONS - 1;
        } else {
            totalObservations = indexTotalObservation[_index];
            nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
            nextIndex = nextIndex != 0 ? nextIndex : _MAX_ALLOWED_OBSERVATIONS - 1;
        }
        currentIndex = nextIndex - 1;
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
}
