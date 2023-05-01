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
    bytes32 public constant ADD_OBSERVATION_ROLE = keccak256("ADD_OBSERVATION_ROLE");
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

    function perpetualOraclesInit() external initializer {}

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
