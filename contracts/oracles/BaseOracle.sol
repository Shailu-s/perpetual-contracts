// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

contract BaseOracle is AccessControlUpgradeable {
    struct Observation {
        uint256 timestamp;
        uint256 priceCumulative;
    }

    // price oracle admin role
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    // role of observation collection
    bytes32 public constant CAN_ADD_OBSERVATION = keccak256("CAN_ADD_OBSERVATION");

    // indices of volatility index {0: ETHV, 1: BTCV}
    uint64 internal _indexCount;
    // mapping to store index to the address of the baseToken
    mapping(uint64 => address) public baseTokenByIndex;
    // mapping to store index by base token address
    mapping(address => uint64) public indexByBaseToken;
    // mapping to store baseToken to Observations
    mapping(uint64 => Observation[]) public observationsByIndex;

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint64 index, uint256 priceCumulative, uint256 timestamp);
    event AssetsAdded(uint256 indexed lastIndex, address[] assets, uint256[] priceCumulatives);

    /**
     * @notice Initialize the contract
     *
     * @param _priceCumulative Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function _BaseOracle_init(
        uint256[] memory _priceCumulative,
        address[] memory _asset,
        address _admin
    ) internal onlyInitializing {
        _addAssets(_priceCumulative, _asset);
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
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
     * @param _priceCumulative Array of current prices
     * @param _asset Array of assets {base token addresses}
     */
    function addAssets(uint256[] memory _priceCumulative, address[] memory _asset) internal {
        _requireOracleAdmin();
        _addAssets(_priceCumulative, _asset);
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _priceCumulative Price of the asset
     */
    function addObservation(uint256 _priceCumulative, uint64 _index) external {
        _requireCanAddObservation();
        require(_priceCumulative != 0, "BaseOracle: Not zero");
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
        for (; observations[index].timestamp >= initialTimestamp; index--) {
            priceCumulative += observations[index].priceCumulative;
            if (index == 0) {
                break;
            }
        }
        priceCumulative = priceCumulative / (observations.length - index);
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


    function _addAssets(uint256[] memory _priceCumulative, address[] memory _asset) internal {
        _requireOracleAdmin();
        uint256 priceCumulativeLength = _priceCumulative.length;
        uint256 assetLength = _asset.length;
        require(priceCumulativeLength == assetLength, "BaseOracle: Unequal length of prices & assets");

        for (uint256 index; index < priceCumulativeLength; index++) {
            require(_asset[index] != address(0), "BaseOracle: Asset address can't be 0");
        }

        Observation memory observation;
        uint64 indexCount = _indexCount;
        uint256 currentTimestamp = block.timestamp;
        for (uint256 index; index < priceCumulativeLength; index++) {
            observation = Observation({ timestamp: currentTimestamp, priceCumulative: _priceCumulative[index] });
            baseTokenByIndex[indexCount] = _asset[index];
            indexByBaseToken[_asset[index]] = indexCount;
            Observation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }
        _indexCount = indexCount;

        emit AssetsAdded(_indexCount, _asset, _priceCumulative);
    }

    function _requireOracleAdmin() internal view {
        require(hasRole(PRICE_ORACLE_ADMIN, _msgSender()), "BaseOracle: not admin");
    }

    function _requireCanAddObservation() internal view {
        require(hasRole(CAN_ADD_OBSERVATION, _msgSender()), "BaseOracle: not observation adder");
    }
}
