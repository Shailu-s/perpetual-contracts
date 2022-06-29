// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";

library BpLibrary {
    using SafeMathUpgradeable for uint256;

    function bp(uint256 value, uint256 bpValue) internal pure returns (uint256) {
        return value.mul(bpValue).div(10000);
    }
}
