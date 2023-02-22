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
    address public insuranceFund;

    event Slashed(address indexed staker, uint256 amount, uint256 remainingAfterSlash);

    function initialize(
        IERC20Upgradeable _stakedToken,
        ISafe _relayerSafe,
        address _volmexSafe,
        uint256 _cooldownSeconds,
        uint256 _unstakeWindow,
        address _insuranceFund
    ) external {
        _initialize(_stakedToken, _relayerSafe, _volmexSafe, _cooldownSeconds, _unstakeWindow);
        slashPenalty = 2500;
        insuranceFund = _insuranceFund;
        _grantRole(SLASHER_ROLE, address(_relayerSafe));
    }

    /**
     * @notice Slash staked token balances and withdraw those funds to the specified address.
     *
     * @param staker The address to receive the slashed tokens.
     *
     * @return _ amount slashed, denominated in the underlying token.
     */
    function slash(address staker)
        external
        nonReentrant
        returns (uint256)
    {
        _requireSlasherRole();
        uint256 underlyingBalance = stakedToken.balanceOf(address(this));
        require(underlyingBalance != 0, "Slashing: insuffient balance");

        // Get the slash amount and remaining amount. Note that remainingAfterSlash is nonzero.
        uint256 stakedAmount = stakersAmount[staker];
        uint256 slashAmount = (stakedAmount * slashPenalty) / SLASH_BASE;
        uint256 remainingAfterSlash = (stakedAmount - slashAmount);

        if (slashAmount == 0) {
            return 0;
        }

        if (remainingAfterSlash < minStakeRequired) {
            // TODO: Logic to remove signer from multisig
        }

        // Transfer the slashed token to insurance fund.
        stakedToken.safeTransfer(insuranceFund, slashAmount);

        emit Slashed(staker, slashAmount, remainingAfterSlash);
        return slashAmount;
    }

    /**
     * @dev Used to update slash penalty percent
     */
    function updateSlashPenalty(uint256 _slashPenalty) external virtual {
        _requireDefaultAdmin();
        slashPenalty = _slashPenalty;
    }

    function _requireSlasherRole() private view {
        require(hasRole(SLASHER_ROLE, _msgSender()), "Slashing: not slasher");
    }
}
