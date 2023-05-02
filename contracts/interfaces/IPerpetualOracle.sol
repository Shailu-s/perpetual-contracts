// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import { IPositioning } from "./IPositioning.sol";

interface IPerpetualOracle {
    function perpetualOraclesInit(
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
    function setFundingPeriod(uint256 _period) external;
    function addMarkObservation(uint256 _index, uint256 _price) external;
    function addIndexObservation(uint256[] memory _indexes, uint256[] memory _prices, bytes32[] memory _proofHashes) external;

    function getLastPriceOfIndex(uint256 _index) external view returns (uint256 underlyingLastPrice);
    function getLastIndexEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp);
    function getCustomIndexEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp);
    function latestRoundData(uint256 _smInterval, uint256 _index) external view returns (uint256 answer, uint256 lastUpdateTimestamp);
    function getLastUpdatedTimestamp(uint256 _index, bool isMark) external view returns (uint256 lastUpdatedTimestamp);
    function getLastPriceOfMark(uint256 _index) external view returns (uint256 underlyingLastPrice);
    function getLastSmaOfMark(uint256 _index, uint256 _smInterval) external view returns (uint256 priceCumulative);
    function getLastMarkPrice(uint256 _index) external view returns (uint256 lastMarkPrice);
    function getCustomUnderlyingSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative);
    function getLastMarkEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp);
    function getCustomMarkEpochPrice(uint256 _index, uint256 _epochTimestamp) external view returns (uint256 price, uint256 timestamp);
    
}
