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

    event ObservationAdderSet(address indexed matchingEngine);
    event IndexObservationAdded(uint256[] index, uint256[] underlyingPrice, uint256 timestamp);
    event MarkObservationAdded(uint256 indexed index, uint256 lastPrice, uint256 markPrice, uint256 timestamp);

    function perpetual_Oracles_Init(
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

    function addIndexObservation(
        uint256[] memory _indexes,
        uint256[] memory _prices,
        bytes32[] memory _proofHashes
    ) external;

    function getLatestIndexPrice(uint256 _index) external view returns (uint256 latestIndexPrice);

    function getLatestMarkPrice(uint256 index) external view returns (uint256 price);

    function getCustomIndexEpochPrice(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price);

    function getLatestIndexSMA(uint256 _smInterval, uint256 _index) external view returns (uint256 answer, uint256 lastUpdateTimestamp);

    function getLastUpdatedTimestamp(uint256 _index, bool isMark) external view returns (uint256 lastUpdatedTimestamp);

    function getLastestLastPriceSMA(uint256 _index, uint256 _smInterval) external view returns (uint256 priceCumulative);

    function getCustomMarkEpochPrice(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 price);

    function indexByBaseToken(address _baseToken) external view returns (uint256 index);
}
