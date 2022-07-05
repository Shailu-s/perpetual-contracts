// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

interface IVirtualToken {
    // Getters
    function isInWhitelist(address account) external view returns (bool);

    // Setters
    function mint(address recipient, uint256 amount) external;
    function burn(address recipient, uint256 amount) external;
    function mintMaximumTo(address recipient) external;
    function addWhitelist(address account) external;
    function removeWhitelist(address account) external;
}
