// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

interface IMintBurn {
    function mint(address _toWhom, uint256 amount) external;
    function burn(address _whose, uint256 amount) external;
}
