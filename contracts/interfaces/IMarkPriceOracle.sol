// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "./IIndexPriceOracle.sol";
import "./IPositioning.sol";

interface IMarkPriceOracle {
    function initialize(
        uint256[] calldata _priceCumulative,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio,
        address _admin
    ) external;

    function volatilityCapRatioByIndex(uint256 _index) external view returns (uint256);

    function getMarkTwap(uint256 _twInterval, uint256 _index) external view returns (uint256 priceCumulative);

    function indexByBaseToken(address _baseToken) external view returns (uint256 index);

    function baseTokenByIndex(uint256 _index) external view returns (address baseToken);

    function getCustomMarkTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative);
    function getLastMarkPrice(uint256 _index) external view returns (uint256 underlyingLastPrice);

    function getCustomUnderlyingTwap(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative);

    function getIndexCount() external view returns (uint256);

    function getLastPrice(uint256 _index) external view returns (uint256 underlyingLastPrice);

    function addAssets(
        uint256[] calldata _underlyingPrice,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) external;

    function setObservationAdder(address _adder) external;

    function addObservation(
        uint256 _underlyingPrice,
        uint256 _index,
        bytes32 _proofHash
    ) external;

    function setMarkTwInterval(uint256 _markTwInterval) external;

    function setIndexOracle(IIndexPriceOracle _indexOracle) external;

    function setPositioning(IPositioning _positioning) external;
}
