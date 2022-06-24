// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.7.6;

interface IMarkSMA {
    function addObservation(uint256 _priceCumulative) external;

    function exchange() external view returns (address);
    function getCumulativePrice(uint256 _twInterval) external view returns (uint256 priceCumulative);
}
