// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { Staking } from "./Staking.sol";
import { IGnosisSafe } from "../interfaces/IGnosisSafe.sol";

contract Slashing is Staking {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // = keccak256("SLASHER_ROLE")
    bytes32 private constant _SLASHER_ROLE = 0x12b42e8a160f6064dc959c6f251e3af0750ad213dbecf573b4710d67d6c28e39;
    uint256 private constant _SLASH_BASE = 10000;

    address public insuranceFund;
    uint256 public slashPenalty;

    event Slashed(address indexed staker, uint256 inactiveAmount, uint256 activeAmount);

    function Slashing_init(
        IERC20Upgradeable _stakedToken,
        IGnosisSafe _relayerMultisig,
        address _stakingAdmin,
        address _slashingAdmin,
        uint256 _cooldownSeconds,
        address _insuranceFund
    ) external initializer {
        _Staking_init(_stakedToken, _relayerMultisig, _stakingAdmin, _cooldownSeconds);
        slashPenalty = 2500;
        insuranceFund = _insuranceFund;
        _grantRole(_SLASHER_ROLE, _slashingAdmin);
        _setRoleAdmin(_SLASHER_ROLE, _SLASHER_ROLE);
    }

    /**
     * @dev Slash staked token balances and withdraw those funds to the specified address.
     *
     * @param _account The address to receive the slashed tokens.
     * @return slashAmount amount slashed, denominated in the underlying token.
     */
    function slash(address _account) external nonReentrant returns (uint256 slashAmount) {
        _requireSlasherRole();
        StakerDetails storage stakerDetails = staker[_account];
        uint256 inactiveBalance = stakerDetails.inactiveBalance;
        uint256 activeBalance = stakerDetails.activeBalance;
        uint256 stakedAmount = inactiveBalance + activeBalance;
        slashAmount = (stakedAmount * slashPenalty) / _SLASH_BASE;

        uint256 slashInactive;
        uint256 slashActive;
        if (slashAmount != 0) {
            (slashInactive, slashActive) = inactiveBalance >= slashAmount ? (slashAmount, 0) : (inactiveBalance, slashAmount - inactiveBalance);

            if (slashInactive != 0) stakerDetails.inactiveBalance -= slashInactive;
            if (slashActive != 0) {
                stakerDetails.activeBalance -= slashActive;
                if (stakerDetails.activeBalance < minStakeRequired) {
                    emit RelayerDeactivated(_account, stakerDetails.activeBalance);
                }
            }
            stakedToken.safeTransfer(insuranceFund, slashAmount);
        }
        emit Slashed(_account, slashInactive, slashActive);
        return slashAmount;
    }

    /**
     * @dev Used to update slash penalty percent
     */
    function updateSlashPenalty(uint256 _slashPenalty) external virtual {
        _requireSlasherRole();
        slashPenalty = _slashPenalty;
    }

    function _requireSlasherRole() private view {
        require(hasRole(_SLASHER_ROLE, _msgSender()), "Slashing: not slasher role");
    }
}
