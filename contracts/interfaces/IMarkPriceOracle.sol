// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

interface IMarkPriceOracle {
    function addObservation(uint256 _priceCumulative) external;

    function exchange() external view returns (address);
    function getCumulativePrice(uint256 _twInterval, uint64 _index) external view returns (uint256 priceCumulative);
}
