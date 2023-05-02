// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { MathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";

import { IPositioning } from "../interfaces/IPositioning.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

contract PerpetualOracles is AccessControlUpgradeable {
    using LibSafeCastUint for uint256;
    using LibPerpMath for int256;

    struct IndexObservation {
        uint256 timestamp;
        uint256 underlyingPrice;
        bytes32 proofHash;
    }
    struct MarkObservation {
        uint256 timestamp;
        uint256 lastPrice;
    }
    struct PriceEpochs {
        uint256 price;
        uint256 timestamp;
    }
    struct EpochInfo {
        uint256 currentCount; // number of elements in current epoch
        uint256 total; // total number of epochs added
        uint256 observationIndex; // current index of observation of last addition to observations
    }

    uint256 private constant _MAX_ALLOWED_EPOCHS = 1095;
    uint256 private constant _MAX_ALLOWED_OBSERVATIONS = 65536;
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    bytes32 public constant ADD_MARK_OBSERVATION_ROLE = keccak256("ADD_MARK_OBSERVATION_ROLE");
    bytes32 public constant ADD_INDEX_OBSERVATION_ROLE = keccak256("ADD_INDEX_OBSERVATION_ROLE");
    bytes32 public constant FUNDING_PERIOD_ROLE = keccak256("FUNDING_PERIOD_ROLE");

    bool private _isInitialTimestampSet;
    uint256 internal _indexCount;

    mapping(uint256 => address) public baseTokenByIndex;
    mapping(address => uint256) public indexByBaseToken;
    mapping(uint256 => IndexObservation[65535]) public indexObservations;
    mapping(uint256 => MarkObservation[65535]) public markObservations;
    mapping(uint256 => PriceEpochs[1094]) public indexEpochs;
    mapping(uint256 => PriceEpochs[1094]) public markEpochs;
    mapping(uint256 => uint256) public lastMarkPrices;
    mapping(uint256 => EpochInfo) public indexEpochInfo;
    mapping(uint256 => EpochInfo) public markEpochInfo;
    uint256 public smInterval;
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
            markObservations[indexCount][0] = MarkObservation({ timestamp: block.timestamp, lastPrice: _markPrices[indexCount] });
            indexObservations[indexCount][0] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _indexPrices[indexCount], proofHash: _proofHashes[indexCount] });
        }
        _indexCount = indexCount; // = 2
        fundingPeriod = 8 hours;
        smInterval = 8 hours;
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

    function setFundingPeriod(uint256 _period) external virtual {
        _requireFundingPeriodRole();
        fundingPeriod = _period;
    }

    function addMarkObservation(uint256 _index, uint256 _price) external virtual {
        _requireAddMarkObservationRole();
        require(_price != 0, "PerpOracle: zero price");
        _pushMarkOrderPrice(_index, _price);
        uint256 markPrice = _getMarkPrice(baseTokenByIndex[_index], _index).abs();
        lastMarkPrices[_index] = markPrice;
        _saveEpoch(_index, _price, true);
        emit MarkObservationAdded(_index, _price, markPrice, block.timestamp);
    }

    function addIndexObservation(uint256[] memory _indexes, uint256[] memory _prices, bytes32[] memory _proofHashes) external virtual {
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
        IndexObservation[65535] memory observations = indexObservations[_index];
        EpochInfo memory head = markEpochInfo[_index];
        underlyingLastPrice = observations[head.observationIndex].underlyingPrice;
    }

    function getLastIndexEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, block.timestamp, false);
    }

    function getCustomIndexEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, _epochTimestamp, false);
    }

    function latestRoundData(uint256 _smInterval, uint256 _index) external view virtual returns (uint256 answer, uint256 lastUpdateTimestamp) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (answer, lastUpdateTimestamp) = _getCustomEpochPrice(_index, startTimestamp, false);
        answer *= 100;
    }

    function getLastUpdatedTimestamp(uint256 _index, bool isMark) external view returns (uint256 lastUpdatedTimestamp) {
        if (isMark) {
            MarkObservation[65535] memory observations = markObservations[_index];
            EpochInfo memory head = markEpochInfo[_index];
            lastUpdatedTimestamp = observations[head.observationIndex].timestamp;
        } else {
            IndexObservation[65535] memory observations = indexObservations[_index];
            EpochInfo memory head = indexEpochInfo[_index];
            lastUpdatedTimestamp = observations[head.observationIndex].timestamp;
        }
    }

    function getLastPriceOfMark(uint256 _index) public view returns (uint256 underlyingLastPrice) {
        MarkObservation[65535] storage observations = markObservations[_index];
        EpochInfo storage head = markEpochInfo[_index];
        underlyingLastPrice = observations[head.observationIndex].lastPrice;
    }

    function getLastSmaOfMark(uint256 _index, uint256 _smInterval) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _smInterval;
        (priceCumulative, ) = _getCustomSma(_index, startTimestamp, block.timestamp);
    }

    function getLastMarkPrice(uint256 _index) external view returns (uint256 lastMarkPrice) {
        lastMarkPrice = lastMarkPrices[_index];
    }

    function getCustomUnderlyingSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomSma(_index, _startTimestamp, _endTimestamp);
    }

    function getLastMarkEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, block.timestamp, true);
    }

    function getCustomMarkEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, _epochTimestamp, true);
    }

    function _pushMarkOrderPrice(uint256 _index, uint256 _price) internal {
        MarkObservation[65535] storage observations = markObservations[_index];
        EpochInfo storage head = markEpochInfo[_index];
        head.observationIndex = head.observationIndex + 1 > _MAX_ALLOWED_OBSERVATIONS ? 0 : head.observationIndex + 1;
        observations[head.observationIndex] = MarkObservation({ timestamp: block.timestamp, lastPrice: _price });

        if (!_isInitialTimestampSet) {
            initialTimestamp = block.timestamp;
            _isInitialTimestampSet = true;
        }
    }

    function _pushIndexOrderPrice(uint256 _index, uint256 _underlyingPrice, bytes32 _proofHash) internal {
        IndexObservation[65535] storage observations = indexObservations[_index];
        EpochInfo storage head = indexEpochInfo[_index];
        head.observationIndex = head.observationIndex + 1 > _MAX_ALLOWED_OBSERVATIONS ? 0 : head.observationIndex + 1;
        observations[head.observationIndex] = IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash });
    }

    function _saveEpoch(uint256 _index, uint256 _price, bool isMark) internal {
        uint256 currentTimestamp = block.timestamp;
        EpochInfo storage epochInfo = isMark ? markEpochInfo[_index] : indexEpochInfo[_index];
        PriceEpochs[1094] storage priceEpoch = isMark ? markEpochs[_index] : indexEpochs[_index];
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
                priceEpoch[currentEpochIndex] = PriceEpochs({ price: _price, timestamp: currentTimestamp });
                epochInfo.currentCount = 1;
                ++epochInfo.total;
            }
        } else {
            _updatePriceEpoch(currentEpochIndex, priceEpoch[currentEpochIndex].price, _price, priceEpoch[currentEpochIndex].timestamp, epochInfo.currentCount, priceEpoch);
            ++epochInfo.currentCount;
        }
    }

    function _updatePriceEpoch(uint256 _epochIndex, uint256 _previousPrice, uint256 _price, uint256 _timestamp, uint256 cardinality, PriceEpochs[1094] storage priceEpoch) private {
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        priceEpoch[_epochIndex] = PriceEpochs({ price: actualPrice, timestamp: _timestamp });
    }

    function _getMarkPrice(address _baseToken, uint256 _index) internal view returns (int256 markPrice) {
        int256 lastFundingRate = positioning.getLastFundingRate(_baseToken);
        uint256 nextFunding = positioning.getNextFunding(_baseToken);

        int256[3] memory prices;
        int256 indexPrice = getLastPriceOfIndex(_index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        uint256 markSma = getLastSmaOfMark(_index, 300); // TODO: add var for hardcode 300
        prices[1] = markSma.toInt256();
        prices[2] = getLastPriceOfMark(_index).toInt256();
        markPrice = prices[0].median(prices[1], prices[2]);
    }

    function _getCustomSma(uint256 _index, uint256 _startTimestamp, uint256 _endTimestamp) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        MarkObservation[65535] storage observations = markObservations[_index];
        EpochInfo storage head = markEpochInfo[_index];
        lastTimestamp = observations[head.observationIndex].timestamp;
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        if (lastTimestamp < _startTimestamp) {
            _startTimestamp = observations[0].timestamp + (((lastTimestamp - observations[0].timestamp) / smInterval) * smInterval);
        }
        uint256 priceCount;
        uint256 index = head.observationIndex;
        for (; observations[index].timestamp >= _startTimestamp; --index) {
            if (observations[index].timestamp <= _endTimestamp) {
                priceCumulative += observations[index].lastPrice;
                priceCount++;
            }
        }
        priceCumulative = priceCumulative / priceCount;
    }

    function _getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp, bool _isMark) internal view returns (uint256 price, uint256 timestamp) {
        PriceEpochs[1094] storage priceEpochs = _isMark ? markEpochs[_index] : indexEpochs[_index];
        EpochInfo storage epochInfo = _isMark ? markEpochInfo[_index] : indexEpochInfo[_index];
        if (epochInfo.total != 0) {
            uint256 priceIndex = findUpperBound(_index, _epochTimestamp, _isMark);
            price = priceEpochs[priceIndex].price;
            timestamp = priceEpochs[priceIndex].timestamp;
        } else {
            return (0, 0);
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

    function findUpperBound(uint256 _index, uint256 _timestamp, bool _isMark) private view returns (uint256) {
        PriceEpochs[1094] memory priceEpoch = _isMark ? markEpochs[_index] : indexEpochs[_index];
        uint256 low = 0;
        uint256 high = 1094;
        while(low < high) {
            uint256 mid = MathUpgradeable.average(low, high);
            if(priceEpoch[mid].timestamp > _timestamp) {
                high = mid;
            } else {
                low = mid + 1;
            }
        }
        if (low > 0 && priceEpoch[low - 1].timestamp == _timestamp) {
            return low - 1;
        } else {
            return low;
        }
    }
}
