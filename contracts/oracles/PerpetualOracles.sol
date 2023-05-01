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
    uint256 public cardinality;

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint256[] index, uint256[] underlyingPrice, uint256 timestamp);

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
