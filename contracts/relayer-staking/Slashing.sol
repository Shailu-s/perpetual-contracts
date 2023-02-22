// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { Staking } from "./Staking.sol";
import { ISafe } from "../interfaces/ISafe.sol";

contract Slashing is Staking {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    uint256 public constant SLASH_BASE = 10000;

    uint256 public slashPenalty;

    function initialize(
        IERC20Upgradeable _stakedToken,
        ISafe _relayerSafe,
        address _volmexSafe,
        uint256 _cooldownSeconds,
        uint256 _unstakeWindow
    ) external {
        _initialize(
            _stakedToken,
            _relayerSafe,
            _volmexSafe,
            _cooldownSeconds,
            _unstakeWindow
        );
        slashPenalty = 2500;
        _grantRole(SLASHER_ROLE, address(_relayerSafe));
    }
}
