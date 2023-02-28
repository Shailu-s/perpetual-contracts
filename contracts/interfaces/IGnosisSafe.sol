// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IGnosisSafe {
    function getThreshold() external view returns (uint256);
    function getOwners() external view returns (address[] memory);
    function isOwner(address owner) external view returns (bool);
}
