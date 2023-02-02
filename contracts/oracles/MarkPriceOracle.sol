// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IMatchingEngine.sol";
import "../helpers/RoleManager.sol";

/**
 * @title Volmex Oracle Mark SMA
 * @author volmex.finance [security@volmexlabs.com]
 */
contract MarkPriceOracle is Initializable, RoleManager {
    using SafeMathUpgradeable for uint256;

    struct Observation {
        uint256 timestamp;
        uint256 priceCumulative;
    }

    // mark price oracle admin role
    bytes32 public constant MARK_PRICE_ORACLE_ADMIN = keccak256("MARK_PRICE_ORACLE_ADMIN");
    // role of observation collection
    bytes32 public constant CAN_ADD_OBSERVATION = keccak256("CAN_ADD_OBSERVATION");

    // Address of the MatchingEngine contract
    address public matchingEngine;

    // Index count
    uint64 internal _indexCount;

    // mapping to store index to the address of the baseToken
    mapping(uint64 => address) public baseTokenByIndex;

    mapping(address => uint64) public indexByBaseToken;

    // mapping to store baseToken to Observations
    mapping(uint64 => Observation[]) public observationsByIndex;

    /// @param matchingEngine The address of the MatchingEngine contract
    event MatchingEngineChanged(address indexed matchingEngine);

    event ObservationAdded(uint64 index, uint256 priceCumulative, uint256 timestamp);

    // Used to check the caller is Exchange contract
    modifier onlyMatchingEngine() {
        require(msg.sender == matchingEngine, "MarkSMA: Not MatchingEngine");
        _;
    }

    /**
     * @notice Initialize the contract
     *
     * @param _priceCumulative Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function initialize(uint256[] memory _priceCumulative, address[] memory _asset) external initializer {
        uint256 priceCumulativeLength = _priceCumulative.length;
        uint256 assetLength = _asset.length;
        require(priceCumulativeLength == assetLength, "MarkSMA: Unequal length of prices & assets");

        for (uint256 index; index < priceCumulativeLength; index++) {
            require(_asset[index] != address(0), "MarkSMA: Asset address can't be 0");
        }

        Observation memory observation;
        uint64 indexCount = _indexCount;

        for (uint256 index; index < priceCumulativeLength; index++) {
            observation = Observation({ timestamp: block.timestamp, priceCumulative: _priceCumulative[index] });
            baseTokenByIndex[indexCount] = _asset[index];
            indexByBaseToken[_asset[index]] = indexCount;
            Observation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }

        _indexCount = indexCount;
        _grantRole(MARK_PRICE_ORACLE_ADMIN, _msgSender());
    }

    function setMatchingEngine(address _matchingEngine) external {
        require(hasRole(MARK_PRICE_ORACLE_ADMIN, _msgSender()), "MarkPriceOracle: Not admin");
        require(_matchingEngine != address(0), "V_PERP_M: Can't be 0 address");
        matchingEngine = _matchingEngine;
        _grantRole(CAN_ADD_OBSERVATION, _matchingEngine);
        emit MatchingEngineChanged(_matchingEngine);
    }

    function addAssets(uint256[] memory _priceCumulative, address[] memory _asset) external onlyMatchingEngine {
        uint256 priceCumulativeLength = _priceCumulative.length;
        uint256 assetLength = _asset.length;
        require(priceCumulativeLength == assetLength, "MarkSMA: Unequal length of prices & assets");

        for (uint256 index; index < priceCumulativeLength; index++) {
            require(_asset[index] != address(0), "MarkSMA: Asset address can't be 0");
        }

        Observation memory observation;
        uint64 indexCount = _indexCount;

        for (uint256 index; index < priceCumulativeLength; index++) {
            observation = Observation({ timestamp: block.timestamp, priceCumulative: _priceCumulative[index] });
            baseTokenByIndex[indexCount] = _asset[index];
            indexByBaseToken[_asset[index]] = indexCount;
            Observation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }

        _indexCount = indexCount;
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _priceCumulative Price of the asset
     */
    function addObservation(uint256 _priceCumulative, uint64 _index) external {
        _requireCanAddObservation();
        require(_priceCumulative != 0, "MarkSMA: Not zero");
        Observation memory observation = Observation({ timestamp: block.timestamp, priceCumulative: _priceCumulative });
        Observation[] storage observations = observationsByIndex[_index];
        observations.push(observation);
        emit ObservationAdded(_index, _priceCumulative, block.timestamp);
    }

    /**
     * @notice Get the single moving average price of the asset
     *
     * @param _twInterval Time in seconds of the range
     * @param _index Index of the observation, the index base token mapping
     * @return priceCumulative The SMA price of the asset
     */
    function getCumulativePrice(uint256 _twInterval, uint64 _index) external view returns (uint256 priceCumulative) {
        Observation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length - 1;
        uint256 initialTimestamp = block.timestamp - _twInterval;
        for (index = observations.length - 1; observations[index].timestamp >= initialTimestamp; index--) {
            priceCumulative += observations[index].priceCumulative;
            if (index == 0) {
                break;
            }
        }
        priceCumulative = priceCumulative.div(observations.length.sub(index));
    }

    /**
     * @notice Get latest price of asset
     *
     * @param _index Index of the observation, the index base token mapping
     */
    function getLatestPrice(uint64 _index) external view returns (uint256 latestPrice) {
        Observation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length - 1;
        latestPrice = observations[index].priceCumulative;
    }

    function _requireCanAddObservation() internal view {
        // MarkPriceOracle: Not Can Add Observation
        require(hasRole(CAN_ADD_OBSERVATION, _msgSender()), "MPO_NCAO");
    }
}
