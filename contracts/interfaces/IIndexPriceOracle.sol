// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

interface IIndexPriceOracle {
    // Getter  methods
    function latestRoundData(uint256 _smInterval, uint256 _index) external view returns (uint256 answer, uint256 lastUpdateTimestamp);

    function getIndexSma(uint256 _smInterval, uint256 _index)
        external
        view
        returns (
            uint256 volatilityTokenSma,
            uint256 iVolatilityTokenSma,
            uint256 lastUpdateTimestamp
        );

    function volatilityCapRatioByIndex(uint256 _index) external view returns (uint256);

    function indexByBaseToken(address _baseToken) external view returns (uint256 index);

    function baseTokenByIndex(uint256 _index) external view returns (address baseToken);

    function getCustomIndexSma(
        uint256 _index,
        uint256 _startTimestamp,
        uint256 _endTimestamp
    ) external view returns (uint256 priceCumulative);

    function getIndexCount() external view returns (uint256);

    function getLastPrice(uint256 _index) external view returns (uint256 underlyingLastPrice);
    function getLastEpochPrice(uint256 _index) external view returns (uint256 price, uint256 timestamp);
    function getLastUpdatedTimestamp(uint256 _index) external view returns (uint256 lastUpdatedTimestamp);


    function addObservation(
        uint256 _underlyingPrice,
        uint256 _index,
        bytes32 _proofHash
    ) external;

    function addAssets(
        uint256[] calldata _underlyingPrice,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio
    ) external;

    function setObservationAdder(address _adder) external;
    function setInitialTimestamp(uint256 _timestamp) external;
    function setIndexSmInterval(uint256 _smInterval) external;
    function grantInitialTimestampRole(address _account) external;
}
