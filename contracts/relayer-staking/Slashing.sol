// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import { Staking } from "./Staking.sol";
import { IGnosisSafe } from "../interfaces/IGnosisSafe.sol";

contract Slashing is Staking {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant SLASHER_ROLE = keccak256("SLASHER_ROLE");
    uint256 public constant SLASH_BASE = 10000;

    uint256 public slashPenalty;
    address public insuranceFund;

    event Slashed(address indexed staker, uint256 inactiveAmount, uint256 activeAmount);

    function initialize(
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
        _grantRole(SLASHER_ROLE, _slashingAdmin);
    }

    /**
     * @dev Slash staked token balances and withdraw those funds to the specified address.
     *
     * @param _account The address to receive the slashed tokens.
     * @return _ amount slashed, denominated in the underlying token.
     */
    function slash(address _account) external nonReentrant returns (uint256) {
        _requireSlasherRole();
        StakerDetails storage stakerDetails = staker[_account];
        uint256 inactiveBalance = stakerDetails.inactiveBalance;
        uint256 activeBalance = stakerDetails.activeBalance;
        uint256 stakedAmount = inactiveBalance + activeBalance;
        uint256 slashAmount = (stakedAmount * slashPenalty) / SLASH_BASE;

        if (slashAmount == 0) {
            emit Slashed(_account, 0, 0);
            return 0;
        } else {
            (uint256 slashInactive, uint256 slashActive) = inactiveBalance >= slashAmount
                ? (slashAmount, 0)
                : (inactiveBalance, slashAmount - inactiveBalance);

            stakerDetails.inactiveBalance -= slashInactive;
            if (slashActive != 0) stakerDetails.activeBalance -= slashActive;
            stakedToken.safeTransfer(insuranceFund, slashAmount);
            emit Slashed(_account, slashInactive, slashActive);
            return slashAmount;
        }
    }

    /**
     * @dev Used to update slash penalty percent
     */
    function updateSlashPenalty(uint256 _slashPenalty) external virtual {
        _requireSlasherRole();
        slashPenalty = _slashPenalty;
    }

    /**
     * @dev Update relayer safe address
     */
    function updateSlasherRole(address _slasherRole) external virtual {
        _requireDefaultAdmin();
        _grantRole(SLASHER_ROLE, _slasherRole);
    }

    function _requireSlasherRole() private view {
        require(hasRole(SLASHER_ROLE, _msgSender()), "Slashing: not slasher role");
    }
}
