// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { IPositioning } from "./IPositioning.sol";

interface IPerpetualOracle {
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
        uint256 cardinality; // number of elements in current epoch
    }
    struct Price {
        uint256 indexPrice;
        uint256 markPrice;
        uint256 lastPrice;
    }

    event ObservationAdderSet(address indexed matchingEngine);
    event IndexObservationAdded(uint256[] index, uint256[] underlyingPrice, uint256 timestamp);
    event MarkObservationAdded(uint256 indexed index, uint256 lastPrice, uint256 markPrice, uint256 timestamp);

    function __PerpetualOracle_init(
        address[2] calldata _baseToken,
        uint256[2] calldata _markPrices,
        uint256[2] calldata _indexPrices,
        bytes32[2] calldata _proofHashes,
        address _admin
    ) external;

    function setPositioning(IPositioning _positioning) external;

    function setMarkObservationAdder(address _adder) external;

    function setIndexObservationAdder(address _adder) external;

    function grantFundingPeriodRole(address _account) external;

    function grantSmaIntervalRole(address _positioningConfig) external;

    function setFundingPeriod(uint256 _period) external;

    function setMarkSmInterval(uint256 _markSmInterval) external;

    function addMarkObservation(uint256 _index, uint256 _price) external;

    function addIndexObservations(
        uint256[] memory _indexes,
        uint256[] memory _prices,
        bytes32[] memory _proofHashes
    ) external;

    function latestIndexPrice(uint256 _index) external view returns (uint256 latestIndexPrice);

    function latestMarkPrice(uint256 index) external view returns (uint256 latestMarkPrice);

    function latestLastPrice(uint256 _index) external view returns (uint256 latestLastPrice);
    function getLatestBaseTokenPrice(uint256[] memory indexes) external view returns (Price[] memory);
    function getIndexEpochSMA(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price);

    function latestIndexSMA(uint256 _smInterval, uint256 _index) external view returns (uint256 answer, uint256 lastUpdateTimestamp);

    function lastestTimestamp(uint256 _index, bool isMark) external view returns (uint256 lastUpdatedTimestamp);

    function lastestLastPriceSMA(uint256 _index, uint256 _smInterval) external view returns (uint256 priceCumulative);

    function getMarkEpochSMA(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price);

    function indexByBaseToken(address _baseToken) external view returns (uint256 index);
    function initialTimestamps(uint256 _index) external view returns (uint256 timestamp);
}
