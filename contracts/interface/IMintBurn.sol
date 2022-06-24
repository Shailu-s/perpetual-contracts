// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface IMintBurn {
    function mint(address _toWhom, uint256 amount) external;
    function burn(address _whose, uint256 amount) external;
}
