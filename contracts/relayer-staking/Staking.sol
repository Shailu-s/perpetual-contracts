// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { BlockContext } from "../helpers/BlockContext.sol";
import { ISafe } from "../interfaces/ISafe.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";

contract Staking is ReentrancyGuardUpgradeable, AccessControlUpgradeable, BlockContext {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    ISafe public relayerSafe;
    IERC20Upgradeable public stakedToken;
    address public volmexSafe;
    uint256 public cooldownSeconds;
    uint256 public unstakeWindow;
    mapping(address => uint256) public stakersCooldowns;
    mapping(address => uint256) public stakersAmount;
    bool public isStakingLive;
    uint256 public minStakeRequired;

    event Staked(address indexed from, address indexed onBehalfOf, uint256 amount);
    event Redeem(address indexed from, address indexed to, uint256 amount);
    event Cooldown(address indexed user);

    function _initialize(
        IERC20Upgradeable _stakedToken,
        ISafe _relayerSafe,
        address _volmexSafe,
        uint256 _cooldownSeconds,
        uint256 _unstakeWindow
    ) internal {
        stakedToken = _stakedToken;
        relayerSafe = _relayerSafe;
        volmexSafe = _volmexSafe;
        cooldownSeconds = _cooldownSeconds;
        unstakeWindow = _unstakeWindow;
        minStakeRequired = 10000 * (10 ** IERC20Metadata(address(_stakedToken)).decimals());

        _grantRole(DEFAULT_ADMIN_ROLE, _volmexSafe);
    }

    function stake(address _onBehalfOf, uint256 _amount) external virtual nonReentrant {
        _requireStakingLive();
        require(relayerSafe.isOwner(_onBehalfOf), "Staking: not signer");
        uint256 balanceOfUser = stakersAmount[_onBehalfOf];
        require(minStakeRequired <= balanceOfUser + _amount, "Staking: ");
        stakersCooldowns[_onBehalfOf] = getNextCooldownTimestamp(0, _amount, _onBehalfOf, balanceOfUser);
        stakersAmount[_onBehalfOf] += _amount;
        stakedToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _onBehalfOf, _amount);
    }

    /**
     * @dev unstake staked tokens
     * @param _to Address to transfer tokens to
     * @param _amount Amount to redeem
     **/
    function unstake(address _to, uint256 _amount) external virtual nonReentrant {
        require(_amount != 0, "Staking: zero amount to unstake");
        uint256 currentTimestamp = _blockTimestamp();
        address msgSender = _msgSender();
        uint256 cooldownStartTimestamp = stakersCooldowns[msgSender];
        require(currentTimestamp > (cooldownStartTimestamp + cooldownSeconds), "Staking: insufficient cooldown");
        require(
            (currentTimestamp - (cooldownStartTimestamp + cooldownSeconds)) <= unstakeWindow,
            "Staking: unstake window finished"
        );
        uint256 balanceOfMessageSender = stakersAmount[msgSender];
        uint256 amountToRedeem = (_amount > balanceOfMessageSender) ? balanceOfMessageSender : _amount;
        if ((balanceOfMessageSender - amountToRedeem) == 0) {
            stakersCooldowns[msgSender] = 0;
        }
        if ((balanceOfMessageSender - amountToRedeem) < minStakeRequired) {
            // TODO: Logic to remove signer from multisig
        }

        stakersAmount[msgSender] -= amountToRedeem;
        IERC20Upgradeable(stakedToken).safeTransfer(_to, amountToRedeem);
        emit Redeem(msgSender, _to, amountToRedeem);
    }

    /**
     * @dev Activates the cooldown period to unstake
     * - It can't be called if the user is not staking
     **/
    function cooldown() external virtual {
        require(stakersAmount[msg.sender] != 0, "Staking invalid balance to cooldown");
        stakersCooldowns[msg.sender] = _blockTimestamp();
        emit Cooldown(msg.sender);
    }

    /**
     * @dev Used to toggle staking, live or pause
     */
    function toggleStaking() external virtual {
        _requireDefaultAdmin();
        isStakingLive = !isStakingLive;
    }

    /**
     * @dev Used to update minimum staker amount required
     */
    function updateMinStakeRequired(uint256 _minStakeAmount) external virtual {
        _requireDefaultAdmin();
        minStakeRequired = _minStakeAmount;
    }

    /**
     * @dev Calculates the how is gonna be a new cooldown timestamp depending on the sender/receiver situation
     *  - If the timestamp of the sender is "better" or the timestamp of the recipient is 0, we take the one of the recipient
     *  - Weighted average of from/to cooldown timestamps if:
     *    # The sender doesn't have the cooldown activated (timestamp 0).
     *    # The sender timestamp is expired
     *    # The sender has a "worse" timestamp
     *  - If the receiver's cooldown timestamp expired (too old), the next is 0
     * @param _fromCooldownTimestamp Cooldown timestamp of the sender
     * @param _amountToReceive Amount
     * @param _toAddress Address of the recipient
     * @param _toBalance Current balance of the receiver
     * @return cooldownTimestamp new cooldown timestamp
     **/
    function getNextCooldownTimestamp(
        uint256 _fromCooldownTimestamp,
        uint256 _amountToReceive,
        address _toAddress,
        uint256 _toBalance
    ) public view returns (uint256) {
        uint256 toCooldownTimestamp = stakersCooldowns[_toAddress];
        if (toCooldownTimestamp == 0) {
            return 0;
        }
        uint256 currentTimestamp = _blockTimestamp();
        uint256 minimalValidCooldownTimestamp = (currentTimestamp - cooldownSeconds) - unstakeWindow;

        if (minimalValidCooldownTimestamp > toCooldownTimestamp) {
            toCooldownTimestamp = 0;
        } else {
            uint256 newFromCooldownTimestamp = (minimalValidCooldownTimestamp > _fromCooldownTimestamp)
                ? currentTimestamp
                : _fromCooldownTimestamp;

            if (newFromCooldownTimestamp < toCooldownTimestamp) {
                return toCooldownTimestamp;
            } else {
                toCooldownTimestamp =
                    ((_amountToReceive * newFromCooldownTimestamp) + (_toBalance * toCooldownTimestamp)) /
                    (_amountToReceive + _toBalance);
            }
        }
        return toCooldownTimestamp;
    }

    function _requireDefaultAdmin() private view {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Staking: not admin");
    }

    function _requireStakingLive() private view {
        require(isStakingLive, "Staking: staking not live");
    }
}
