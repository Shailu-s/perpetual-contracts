// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract PerpetualOracles is AccessControlUpgradeable {
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

    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    bytes32 public constant ADD_MARK_OBSERVATION_ROLE = keccak256("ADD_MARK_OBSERVATION_ROLE");
    bytes32 public constant ADD_INDEX_OBSERVATION_ROLE = keccak256("ADD_INDEX_OBSERVATION_ROLE");
    bytes32 public constant INITIAL_TIMESTAMP_ROLE = keccak256("INITIAL_TIMESTAMP_ROLE");

    uint256 internal _indexCount;
    mapping(uint256 => address) public baseTokenByIndex;
    mapping(address => uint256) public indexByBaseToken;
    mapping(uint256 => IndexObservation[]) public indexObservations;
    mapping(uint256 => MarkObservation[]) public markObservations;
    mapping(uint256 => PriceEpochs[]) public indexEpochs;
    mapping(uint256 => PriceEpochs[]) public markEpochs;
    uint256 public smInterval;
    uint256 public initialTimestamp;
    uint256 public markCardinality;
    uint256 public indexCardinality;

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
            markObservations[indexCount].push(MarkObservation({timestamp: block.timestamp, lastPrice: _markPrices[indexCount]}));
            indexObservations[indexCount].push(IndexObservation({timestamp: block.timestamp, underlyingPrice: _indexPrices[indexCount], proofHash: _proofHashes[indexCount]}));
        }
        _indexCount = indexCount; // = 2
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
    }

    function setMarkObservationAdder(address _adder) external {
        _requireOracleAdmin();
        require(_adder != address(0), "PerpOracle: zero address");
        _grantRole(ADD_MARK_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    function setIndexObservationAdder(address _adder) external {
        _requireOracleAdmin();
        require(_adder != address(0), "PerpOracle: zero address");
        _grantRole(ADD_INDEX_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    function addMarkObservation(uint256 _index, uint256 _price) external virtual {
        _requireAddMarkObservationRole();
        require(_price != 0, "PerpOracle: zero price");
        _pushMarkOrderPrice(_index, _price);
        uint256 markPrice;
        // TODO: Add mark price calculation and set it
        _saveMarkEpoch(_index, _price);
        emit MarkObservationAdded(_index, _price, markPrice, block.timestamp);
    }

    function addIndexObservation(uint256[] memory _indexes, uint256[] memory _prices, bytes32[] memory _proofHashes) external virtual {
        _requireAddIndexObservationRole();
        uint256 numberOfPrices = _prices.length;
        for (uint256 index; index < numberOfPrices; ++index) {
            require(_prices[index] != 0, "PerpOracle: zero price");
            _pushIndexOrderPrice(_indexes[index], _prices[index], _proofHashes[index]);
            _saveIndexEpoch(_indexes[index], _prices[index]);
        }
        emit IndexObservationAdded(_indexes, _prices, block.timestamp);
    }

    function _pushMarkOrderPrice(
        uint256 _index,
        uint256 _price
    ) internal  {
        MarkObservation[] storage observations = markObservations[_index];
        observations.push(MarkObservation({ timestamp: block.timestamp, lastPrice: _price}));
        if (observations.length == 2) {
            initialTimestamp = block.timestamp;
        }
    }

    function _pushIndexOrderPrice(
        uint256 _index,
        uint256 _underlyingPrice,
        bytes32 _proofHash
    ) internal {
        IndexObservation[] storage observations = indexObservations[_index];
        observations.push(IndexObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, proofHash: _proofHash }));
    }

    // TODO: Add for index epoch as well
    function _saveMarkEpoch(uint256 _index, uint256 _price) internal {
        uint256 currentTimestamp = block.timestamp;
        PriceEpochs[] memory priceEpochs = markEpochs[_index];
        uint256 currentEpochIndex = priceEpochs.length;
        if ((currentTimestamp - initialTimestamp) / smInterval > currentEpochIndex || currentEpochIndex == 0) {
            if (currentEpochIndex != 0 && (currentTimestamp - priceEpochs[currentEpochIndex - 1].timestamp) / smInterval == 0) {
                _updatePriceEpoch(_index, currentEpochIndex - 1, priceEpochs[currentEpochIndex - 1].price, _price, priceEpochs[currentEpochIndex - 1].timestamp, true);
                ++markCardinality;
            } else {
                PriceEpochs[] storage priceEpoch = markEpochs[_index];
                priceEpoch.push(PriceEpochs({ price: _price, timestamp: currentTimestamp }));
                markCardinality = 1;
            }
        } else {
            _updatePriceEpoch(_index, currentEpochIndex - 1, priceEpochs[currentEpochIndex - 1].price, _price, priceEpochs[currentEpochIndex - 1].timestamp, true);
            ++markCardinality;
        }
    }

    function _saveIndexEpoch(uint256 _index, uint256 _price) internal {
        uint256 currentTimestamp = block.timestamp;
        PriceEpochs[] memory priceEpochs = indexEpochs[_index];
        uint256 currentEpochIndex = priceEpochs.length;
        if ((currentTimestamp - initialTimestamp) / smInterval > currentEpochIndex || currentEpochIndex == 0) {
            if (currentEpochIndex != 0 && (currentTimestamp - priceEpochs[currentEpochIndex - 1].timestamp) / smInterval == 0) {
                _updatePriceEpoch(_index, currentEpochIndex - 1, priceEpochs[currentEpochIndex - 1].price, _price, priceEpochs[currentEpochIndex - 1].timestamp, false);
                ++indexCardinality;
            } else {
                PriceEpochs[] storage priceEpoch = indexEpochs[_index];
                priceEpoch.push(PriceEpochs({ price: _price, timestamp: currentTimestamp }));
                indexCardinality = 1;
            }
        } else {
            _updatePriceEpoch(_index, currentEpochIndex - 1, priceEpochs[currentEpochIndex - 1].price, _price, priceEpochs[currentEpochIndex - 1].timestamp, false);
            ++indexCardinality;
        }
    }

    function _updatePriceEpoch(
        uint256 _index,
        uint256 _epochIndex,
        uint256 _previousPrice,
        uint256 _price,
        uint256 _timestamp,
        bool isMark
    ) private {
        PriceEpochs[] storage priceEpoch = isMark ? markEpochs[_index] : indexEpochs[_index];
        uint256 cardinality = isMark ? markCardinality : indexCardinality;
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        priceEpoch[_epochIndex] = PriceEpochs({ price: actualPrice, timestamp: _timestamp });
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

    function _requireInitialTimestampRole() internal view {
        require(hasRole(INITIAL_TIMESTAMP_ROLE, _msgSender()), "PerpOracle: not first interval adder");
    }
}
