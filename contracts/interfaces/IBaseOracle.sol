// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

interface IBaseOracle {
    function volatilityCapRatioByIndex(uint256 _index) external view returns (uint256);
    function getCumulativePrice(uint256 _twInterval, uint64 _index) external view returns (uint256 priceCumulative);
    function indexByBaseToken(address _baseToken) external view returns (uint64 index);
    function baseTokenByIndex(uint64 _index) external view returns (address baseToken);
    // function observationsByIndex(uint64 _index) external view returns 
    function getIndexCount() external view returns (uint64);
    function getLatestPrice(uint64 _index) external view returns (uint256 underlyingLastPrice);

    function addObservation(uint256 _underlyingPrice, uint64 _index, bytes32 _proofHash) external;
    function addAssets(uint256[] calldata _underlyingPrice, address[] calldata _asset, bytes32[] calldata _proofHash, uint256[] calldata _capRatio) external;
    function setObservationAdder(address _adder) external;
}
