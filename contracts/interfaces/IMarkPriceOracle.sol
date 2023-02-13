// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

interface IMarkPriceOracle {
    function addObservation(uint256 _priceCumulative, uint64 _index) external;
    function exchange() external view returns (address);
    function getCumulativePrice(uint256 _twInterval, uint64 _index) external view returns (uint256 priceCumulative);
    function indexByBaseToken(address _baseToken) external view returns (uint64 _index);
    function addAssets(uint256[] memory _priceCumulative, address[] memory _asset) external;
}
