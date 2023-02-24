// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

contract Safe {
    mapping(address => bool) public isOwner;

    function setOwner(address account) external {
        isOwner[account] = true;
    }
}
