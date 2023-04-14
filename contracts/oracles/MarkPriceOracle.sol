// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { IPositioning } from "../interfaces/IPositioning.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import "hardhat/console.sol";

/**
 * @title Volmex Oracle Mark SMA
 * @author volmex.finance [security@volmexlabs.com]
 */
contract MarkPriceOracle is AccessControlUpgradeable {
    using LibSafeCastUint for uint256;
    using LibPerpMath for int256;

    struct MarkPriceObservation {
        uint256 timestamp;
        uint256 underlyingPrice;
        uint256 markPrice;
    }
    struct MarkPriceByEpoch {
        uint256 price;
        uint256 timestamp;
    }

    IPositioning public positioning;
    IIndexPriceOracle public indexOracle;
    uint256 public markTwInterval;
    uint256 public initialTimestamp; // Set at mark-oracle when first successful openPosition.
    // price oracle admin role
    bytes32 public constant PRICE_ORACLE_ADMIN = keccak256("PRICE_ORACLE_ADMIN");
    // role of observation collection
    bytes32 public constant ADD_OBSERVATION_ROLE = keccak256("ADD_OBSERVATION_ROLE");
    // role of observation collection
    bytes32 public constant TWAP_INTERVAL_ROLE = keccak256("TWAP_INTERVAL_ROLE");

    // indices of volatility index {0: ETHV, 1: BTCV}
    uint256 internal _indexCount;
    // mapping to store index to the address of the baseToken
    mapping(uint256 => address) public baseTokenByIndex;
    // mapping to store index by base token address
    mapping(address => uint256) public indexByBaseToken;
    // mapping to store baseToken to Observations
    mapping(uint256 => MarkPriceObservation[]) public observationsByIndex;
    mapping(uint256 => MarkPriceByEpoch[]) public markPriceAtEpochs;
    uint256 public cardinality; // timestamp of last calculated epoch's end timestamp

    event ObservationAdderSet(address indexed matchingEngine);
    event ObservationAdded(uint256 indexed index, uint256 underlyingPrice, uint256 markPrice, uint256 timestamp);
    event AssetsAdded(uint256 indexed lastIndex, address[] assets, uint256[] underlyingPrices);

    /**
     * @notice Initialize the contract
     *
     * @param _priceCumulative Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function initialize(
        uint256[] calldata _priceCumulative,
        address[] calldata _asset,
        address _admin
    ) external initializer {
        _addAssets(_priceCumulative, _asset);
        _setRoleAdmin(PRICE_ORACLE_ADMIN, PRICE_ORACLE_ADMIN);
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        markTwInterval = 300; // 5 minutes
    }

    /**
     * @notice Set positioning contract
     * @param _positioning Address of positioning contract typed in interface
     */
    function setPositioning(IPositioning _positioning) external virtual {
        _requireOracleAdmin();
        positioning = _positioning;
    }

    /**
     * @notice grant Twap interval role to positioning config contract
     * @param _positioningConfig Address of positioning contract typed
     */
    function grantTwapIntervalRole(address _positioningConfig) external virtual {
        _requireOracleAdmin();
        _grantRole(TWAP_INTERVAL_ROLE, _positioningConfig);
    }

    /**
     * @notice Set positioning contract
     * @param _indexOracle Address of positioning contract typed in interface
     */
    function setIndexOracle(IIndexPriceOracle _indexOracle) external virtual {
        _requireOracleAdmin();
        indexOracle = _indexOracle;
    }

    /**
     * @notice Set positioning contract
     * @param _markTwInterval Address of positioning contract typed in interface
     */
    function setMarkTwInterval(uint256 _markTwInterval) external virtual {
        _requireTwapIntervalRole();
        markTwInterval = _markTwInterval;
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _underlyingPrice Price of the asset
     * @param _index position of the asset
     * @param _underlyingPrice hash of price collection
     */
    function addObservation(uint256 _underlyingPrice, uint256 _index) external virtual {
        _requireCanAddObservation();
        require(_underlyingPrice != 0, "MarkPriceOracle: Not zero");
       _pushOrderPrice(_index, _underlyingPrice, 0, false);
        uint256 markPrice = _getMarkPrice(baseTokenByIndex[_index], _index).abs();
        _pushOrderPrice(_index, _underlyingPrice, markPrice, true);
        _save(_index, markPrice);
        emit ObservationAdded(_index, _underlyingPrice, markPrice, block.timestamp);
    }

    function _getMarkPrice(address _baseToken, uint256 _index) internal view returns (int256 markPrice) {
        int256 lastFundingRate = positioning.getLastFundingRate(_baseToken);
        uint256 nextFunding = positioning.getNextFunding(_baseToken);
        uint256 fundingPeriod = positioning.getFundingPeriod();

        int256[3] memory prices;
        int256 indexPrice = indexOracle.getLastPrice(_index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        uint256 markTwap = getLastTwap(_index, markTwInterval);
        prices[1] = markTwap.toInt256();
        prices[2] = getLastPrice(_index).toInt256();
        markPrice = prices[0].median(prices[1], prices[2]);
        console.log(" mark price");
        console.logInt(markPrice);
    }

    /**
     * @notice Set price observation collector
     *
     * @param _adder Address of price collector
     */
    function setObservationAdder(address _adder) external {
        _requireOracleAdmin();
        require(_adder != address(0), "MarkPriceOracle: zero address");
        _grantRole(ADD_OBSERVATION_ROLE, _adder);
        emit ObservationAdderSet(_adder);
    }

    /**
     * @notice Add new observation corresponding to the asset
     *
     * @param _underlyingPrice Array of current prices
     * @param _asset Array of assets {base token addresses}
     */
    function addAssets(uint256[] calldata _underlyingPrice, address[] calldata _asset) external {
        _requireOracleAdmin();
        _addAssets(_underlyingPrice, _asset);
    }

    /**
     * @notice Get the single moving average price of the asset
     *
     * @param _twInterval Time in seconds of the range
     * @param _index Index of the observation, the index base token mapping
     * @return priceCumulative The SMA price of the asset
     */
    function getMarkTwap(uint256 _twInterval, uint256 _index) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _twInterval;
        (priceCumulative, ) = _getCustomTwap(_index, startTimestamp, block.timestamp, true);
    }

    function getLastTwap(uint256 _index, uint256 _twInterval) public view returns (uint256 priceCumulative) {
        uint256 startTimestamp = block.timestamp - _twInterval;
        (priceCumulative, ) = _getCustomTwap(_index, startTimestamp, block.timestamp, false);
    }

    /**
     * @notice Get price cumulative of custom window of the observations
     *
     * @param _index Position of the asset in Observations
     * @param _startTimestamp timestamp of start of window
     * @param _endTimestamp timestamp of last of window
     */
    function getCustomUnderlyingTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomTwap(_index, _startTimestamp, _endTimestamp, false);
    }

    /**
     * @notice Get price cumulative of custom window of the observations
     *
     * @param _index Position of the asset in Observations
     * @param _startTimestamp timestamp of start of window
     * @param _endTimestamp timestamp of last of window
     */
    function getCustomMarkTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative) {
        (priceCumulative, ) = _getCustomTwap(_index, _startTimestamp, _endTimestamp, true);
    }

    /**
     * @notice Get latest price of asset
     *
     * @param _index Index of the observation, the index base token mapping
     */
    function getLastPrice(uint256 _index) public view returns (uint256 underlyingLastPrice) {
        MarkPriceObservation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length - 1;
        underlyingLastPrice = observations[index].underlyingPrice;
    }

    function getLastMarkPrice(uint256 _index) external view returns (uint256 underlyingLastPrice) {
        MarkPriceObservation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length - 1;
        underlyingLastPrice = observations[index].markPrice;
    }

    function getLastEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, block.timestamp);
    }

    function getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp) {
        (price, timestamp) = _getCustomEpochPrice(_index, _epochTimestamp);
    }

    /**
     * @notice Get index count of assets
     */
    function getIndexCount() external view returns (uint256) {
        return _indexCount;
    }

    function getLastUpdatedTimestamp(uint256 _index) external view returns (uint256 lastUpdatedTimestamp) {
        MarkPriceObservation[] memory observations = observationsByIndex[_index];
        lastUpdatedTimestamp = observations[observations.length - 1].timestamp;
    }

    function _addAssets(uint256[] calldata _underlyingPrices, address[] calldata _assets) internal {
        uint256 underlyingPriceLength = _underlyingPrices.length;
        require(underlyingPriceLength == _assets.length, "MarkPriceOracle: Unequal length of prices & assets");

        for (uint256 index; index < underlyingPriceLength; index++) {
            require(_assets[index] != address(0), "MarkPriceOracle: Asset address can't be 0");
        }

        MarkPriceObservation memory observation;
        uint256 indexCount = _indexCount;
        uint256 currentTimestamp = block.timestamp;
        for (uint256 index; index < underlyingPriceLength; index++) {
            observation = MarkPriceObservation({ timestamp: currentTimestamp, underlyingPrice: _underlyingPrices[index], markPrice: _underlyingPrices[index] });
            baseTokenByIndex[indexCount] = _assets[index];
            indexByBaseToken[_assets[index]] = indexCount;
            MarkPriceObservation[] storage observations = observationsByIndex[indexCount];
            observations.push(observation);
            indexCount++;
        }
        _indexCount = indexCount;

        emit AssetsAdded(_indexCount, _assets, _underlyingPrices);
    }

    function _pushOrderPrice(
        uint256 _index,
        uint256 _underlyingPrice,
        uint256 _markPrice,
        bool isUpdate
    ) internal  {
       
        MarkPriceObservation[] storage observations = observationsByIndex[_index];
        if(!isUpdate){
            observations.push(MarkPriceObservation({ timestamp: block.timestamp, underlyingPrice: _underlyingPrice, markPrice: _markPrice }));
            uint256 totalPrices = observations.length - 1 ;
            if (totalPrices == 1) {
                indexOracle.setInitialTimestamp(block.timestamp);
                initialTimestamp = block.timestamp;
            }
        } else {
            uint256 totalPrices = observations.length -1 ;
            observations[totalPrices].markPrice = _markPrice;
        } 

    }

    function _save(uint256 _index, uint256 _price) internal {
        uint256 currentTimestamp = block.timestamp;
        MarkPriceByEpoch[] memory markPriceByEpoch = markPriceAtEpochs[_index];
        uint256 currentEpochIndex = markPriceByEpoch.length;
        if ((currentTimestamp - initialTimestamp) / markTwInterval > currentEpochIndex || currentEpochIndex == 0) {
            if (currentEpochIndex != 0 && (currentTimestamp - markPriceByEpoch[currentEpochIndex - 1].timestamp) / markTwInterval == 0) {
                _updatePriceEpoch(_index, currentEpochIndex - 1, markPriceByEpoch[currentEpochIndex - 1].price, _price, markPriceByEpoch[currentEpochIndex - 1].timestamp);
            } else {
                MarkPriceByEpoch[] storage markPriceEpoch = markPriceAtEpochs[_index];
                markPriceEpoch.push(MarkPriceByEpoch({ price: _price, timestamp: currentTimestamp }));
                cardinality = 1;
            }
        } else {
            _updatePriceEpoch(_index, currentEpochIndex - 1, markPriceByEpoch[currentEpochIndex - 1].price, _price, markPriceByEpoch[currentEpochIndex - 1].timestamp);
        }
    }

    function _updatePriceEpoch(
        uint256 _index,
        uint256 _epochIndex,
        uint256 _previousPrice,
        uint256 _price,
        uint256 _timestamp
    ) private {
        uint256 actualPrice = (_previousPrice * cardinality + _price) / (cardinality + 1);
        MarkPriceByEpoch[] storage markPriceEpoch = markPriceAtEpochs[_index];
        markPriceEpoch[_epochIndex] = MarkPriceByEpoch({ price: actualPrice, timestamp: _timestamp });
        ++cardinality;
    }

    function _getCustomEpochPrice(uint256 _index, uint256 _epochTimestamp) internal view returns (uint256 price, uint256 timestamp) {
        MarkPriceByEpoch[] memory markPriceByEpoch = markPriceAtEpochs[_index];
        uint256 totalEpochs = markPriceByEpoch.length;
        if (totalEpochs != 0) {
            for (; totalEpochs != 0 && markPriceByEpoch[totalEpochs - 1].timestamp >= _epochTimestamp; totalEpochs--) {}
            price = markPriceByEpoch[totalEpochs - 1].price;
            timestamp = markPriceByEpoch[totalEpochs - 1].timestamp;
        } else {
            return (0, 0);
        }
    }

    function _getCustomTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp,
        bool _isMarkTwapRequired
    ) internal view returns (uint256 priceCumulative, uint256 lastTimestamp) {
        MarkPriceObservation[] memory observations = observationsByIndex[_index];
        uint256 index = observations.length;
        lastTimestamp = observations[index - 1].timestamp;
        _endTimestamp = lastTimestamp < _endTimestamp ? lastTimestamp : _endTimestamp;
        if (lastTimestamp < _startTimestamp) {
            _startTimestamp = observations[0].timestamp + (((lastTimestamp - observations[0].timestamp) / markTwInterval) * markTwInterval);
        }
        uint256 priceCount;
        if (_isMarkTwapRequired) {
            for (; index != 0 && observations[index - 1].timestamp >= _startTimestamp; index--) {
                if (observations[index - 1].timestamp <= _endTimestamp) {
                    priceCumulative += observations[index - 1].markPrice;
                    priceCount++;
                }
            }
        } else {
            for (; index != 0 && observations[index - 1].timestamp >= _startTimestamp; index--) {
                if (observations[index - 1].timestamp <= _endTimestamp) {
                    priceCumulative += observations[index - 1].underlyingPrice;
                    priceCount++;
                }
            }
        }
        priceCumulative = priceCumulative / priceCount;
    }

    function _requireOracleAdmin() internal view {
        require(hasRole(PRICE_ORACLE_ADMIN, _msgSender()), "MarkPriceOracle: not admin");
    }

    function _requireTwapIntervalRole() internal view {
        require(hasRole(TWAP_INTERVAL_ROLE, _msgSender()), "MarkPriceOracle: not twap interval role");
    }

    function _requireCanAddObservation() internal view {
        require(hasRole(ADD_OBSERVATION_ROLE, _msgSender()), "MarkPriceOracle: not observation adder");
    }
}
