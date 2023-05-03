// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

contract PerpetualOracle is AccessControlUpgradeable, IPerpetualOracle {
    using LibSafeCastUint for uint256;
    using LibPerpMath for int256;
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
    mapping(uint256 => IndexObservation[_MAX_ALLOWED_OBSERVATIONS - 1]) public indexObservations; // since index  is started from zero
    mapping(uint256 => LastPriceObservation[_MAX_ALLOWED_OBSERVATIONS - 1]) public lastPriceObservations; // since index  is started from zero
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS - 1]) public indexEpochs; // since index  is started from zero
    mapping(uint256 => PriceEpochs[_MAX_ALLOWED_EPOCHS - 1]) public markEpochs; // since index  is started from zero
    mapping(uint256 => uint256) public lastestMarkPrice;
    mapping(uint256 => uint256) public lastPriceTotalObservations;
    mapping(uint256 => uint256) public indexTotalObservations;
    uint256 markPriceEpochCount;
    uint256 indexPriceEpochCount;
    uint256 public smInterval;
    uint256 public markSmInterval;
    uint256 public initialTimestamp;
    uint256 public fundingPeriod;
    IPositioning public positioning;

    function __Perpetual_Oracles_Init(
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
            lastPriceObservations[indexCount][0] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _markPrices[indexCount] });
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

    function setFundingPeriod(uint256 _period) external virtual {
        _requireFundingPeriodRole();
        fundingPeriod = _period;
    }

    function setMarkSmInterval(uint256 _markSmInterval) external virtual {
        _requireSmaIntervalRole();
        markSmInterval = _markSmInterval;
    }

    function addMarkObservations(uint256 _index, uint256 _price) external virtual {
        _requireAddMarkObservationRole();
        require(_price != 0, "PerpOracle: zero price");
        _pushLastPrice(_index, _price);
        uint256 markPrice = _calculateMarkPrice(baseTokenByIndex[_index], _index).abs();
        lastestMarkPrice[_index] = markPrice;
        _saveEpoch(_index, _price, true);
        emit MarkObservationAdded(_index, _price, markPrice, block.timestamp);
    }

    function addIndexObservations(
        uint256[] memory _indexes,
        uint256[] memory _prices,
        bytes32[] memory _proofHashes
    ) external virtual {
        _requireAddIndexObservationRole();
        uint256 numberOfPrices = _prices.length;
        for (uint256 index; index < numberOfPrices; ++index) {
            require(_prices[index] != 0, "PerpOracle: zero price");
            _pushIndexPrice(_indexes[index], _prices[index], _proofHashes[index]);
            _saveEpoch(_indexes[index], _prices[index], false);
        }
        emit IndexObservationAdded(_indexes, _prices, block.timestamp);
    }

    function latestIndexPrice(uint256 _index) public view returns (uint256 latestIndexPrice) {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 currentIndex = _getCurrentIndex(_index, false);
        latestIndexPrice = observations[currentIndex].underlyingPrice;
    }

    function latestIndexSMA(uint256 _smInterval, uint256 _index) external view virtual override returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (answer, lastUpdateTimestamp) = _getIndexSma(_index, startTimestamp, block.timestamp);
    }

    function latestMarkPrice(uint256 _index) public view override returns (uint256 _lastestMarkPrice) {
        _lastestMarkPrice = lastestMarkPrice[_index];
    }

    function lastestTimestamp(uint256 _index, bool isLastPrice) external view returns (uint256 lastestTimestamp) {
        if (isLastPrice) {
            LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
            uint256 currentIndex = _getCurrentIndex(_index, true);
            lastestTimestamp = observations[currentIndex].timestamp;
        } else {
            uint256 currentIndex = _getCurrentIndex(_index, false);
            IndexObservation[65535] storage observations = indexObservations[_index];

            lastestTimestamp = observations[currentIndex].timestamp;
        }
    }

    function lastestLastPriceSMA(uint256 _index, uint256 _smInterval) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (priceCumulative, ) = _getLastPriceSma(_index, startTimestamp, block.timestamp);
    }

    function latestLastPrice(uint256 _index) external view returns (uint256 latestLastPrice) {
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 currentIndex = _getCurrentIndex(_index, false);
        latestLastPrice = observations[currentIndex].lastPrice;
    }

    function getIndexEpochSMA(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price) {
        (price) = _getEpochSMA(_index, _startTimestamp, _endTimestamp, false);
    }

    function getLastEpochSMA(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price) {
        (price) = _getEpochSMA(_index, _startTimestamp, _endTimestamp, true);
    }

    function _pushLastPrice(uint256 _index, uint256 _price) internal {
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 totalObservations = lastPriceTotalObservations[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = LastPriceObservation({ timestamp: block.timestamp, lastPrice: _price });
        ++lastPriceTotalObservations[_index];

        if (totalObservations == 1) {
            initialTimestamp = block.timestamp;
        }
    }

    function _pushIndexPrice(
        uint256 _index,
        uint256 _underlyingPrice,
        bytes32 _proofHash
    ) internal {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = indexTotalObservations[_index];
        uint256 nextIndex = totalObservations < _MAX_ALLOWED_OBSERVATIONS ? totalObservations : totalObservations % _MAX_ALLOWED_OBSERVATIONS;
        observations[nextIndex] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
        ++indexTotalObservations[_index];
    }

    function _saveEpoch(
        uint256 _index,
        uint256 _price,
        bool _isLastPrice
    ) internal {
        uint256 currentTimestamp = block.timestamp;
        uint256 totalEpochs = _isLastPrice ? markPriceEpochCount : indexPriceEpochCount;
        PriceEpochs[1094] storage priceEpoch = _isLastPrice ? markEpochs[_index] : indexEpochs[_index];
        uint256 currentEpochIndex;
        if (totalEpochs < _MAX_ALLOWED_EPOCHS) {
            currentEpochIndex = totalEpochs != 0 ? totalEpochs - 1 : 0;
        } else {
            currentEpochIndex = totalEpochs % _MAX_ALLOWED_EPOCHS;
            currentEpochIndex = currentEpochIndex != 0 ? currentEpochIndex - 1 : _MAX_ALLOWED_EPOCHS - 1;
        }

        if ((currentTimestamp - initialTimestamp) / smInterval > totalEpochs || totalEpochs == 0) {
            if (totalEpochs != 0 && (currentTimestamp - priceEpoch[currentEpochIndex].timestamp) / smInterval == 0) {
                _updatePriceEpoch(
                    currentEpochIndex,
                    priceEpoch[currentEpochIndex].price,
                    _price,
                    priceEpoch[currentEpochIndex].timestamp,
                    priceEpoch[currentEpochIndex].cardinality,
                    priceEpoch
                );
            } else {
                currentEpochIndex = totalEpochs != 0 ? currentEpochIndex + 1 : 0;
                priceEpoch[currentEpochIndex] = PriceEpochs({ price: _price, timestamp: currentTimestamp, cardinality: 1 });
                _isLastPrice ? ++markPriceEpochCount : ++indexPriceEpochCount;
            }
        } else {
            _updatePriceEpoch(
                currentEpochIndex,
                priceEpoch[currentEpochIndex].price,
                _price,
                priceEpoch[currentEpochIndex].timestamp,
                priceEpoch[currentEpochIndex].cardinality,
                priceEpoch
            );
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
        int256 indexPrice = latestIndexPrice(_index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        uint256 lastPriceSma = lastestLastPriceSMA(_index, markSmInterval);
        prices[1] = lastPriceSma.toInt256();
        prices[2] = latestMarkPrice(_index).toInt256();
        markPrice = prices[0].median(prices[1], prices[2]);
    }

    function _getLastPriceSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        LastPriceObservation[65535] storage observations = lastPriceObservations[_index];
        uint256 totalObservations = lastPriceTotalObservations[_index];
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
            if ((totalObservations < _MAX_ALLOWED_OBSERVATIONS && index == 0) || (priceCount > 0 && currentIndex == index)) {
                break;
            }
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

    function _getIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        IndexObservation[65535] storage observations = indexObservations[_index];
        uint256 totalObservations = indexTotalObservations[_index];
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
            if ((totalObservations < _MAX_ALLOWED_OBSERVATIONS && index == 0) || (priceCount > 0 && currentIndex == index)) {
                break;
            }
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].underlyingPrice;
                priceCount++;
            }
        }

        priceCumulative = priceCumulative / priceCount;
    }

    function _getEpochSMA(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp,
        bool _isLastPrice
    ) internal view returns (uint256 price) {
        PriceEpochs[_MAX_ALLOWED_EPOCHS - 1] storage priceEpochs = _isLastPrice ? markEpochs[_index] : indexEpochs[_index];
        uint256 totalEpochs = _isLastPrice ? markPriceEpochCount : indexPriceEpochCount;
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
                if ((totalEpochs < _MAX_ALLOWED_EPOCHS && index == 0) || (priceCount > 0 && currentIndex == index)) {
                    break;
                }
                if (priceEpochs[index].timestamp <= _endTimestamp) {
                    priceCumulative += priceEpochs[index].price * priceEpochs[index].cardinality;
                    priceCount = priceCount + priceEpochs[index].cardinality;
                }
            }

            price = priceCumulative / priceCount;
        }
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
