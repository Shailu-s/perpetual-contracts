// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { BlockContext } from "../helpers/BlockContext.sol";
import { IGnosisSafe } from "../interfaces/IGnosisSafe.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";

contract Staking is ReentrancyGuardUpgradeable, AccessControlUpgradeable, BlockContext {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    bytes32 public constant STAKER_ROLE = keccak256("STAKER_ROLE");

    IGnosisSafe public relayerMultisig;
    IERC20Upgradeable public stakedToken;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public stakersCooldowns;
    mapping(address => uint256) public stakersAmount;
    bool public isStakingLive;
    uint256 public minStakeRequired;

    event Staked(address indexed from, address indexed onBehalfOf, uint256 amount);
    event Redeem(address indexed from, address indexed to, uint256 amount);
    event CoolDownActivated(address indexed user);

    function _Staking_init(
        IERC20Upgradeable _stakedToken,
        IGnosisSafe _relayerMultisig,
        address _stakingAdmin,
        uint256 _cooldownSeconds
    ) internal onlyInitializing {
        stakedToken = _stakedToken;
        relayerMultisig = _relayerMultisig;
        cooldownSeconds = _cooldownSeconds;
        minStakeRequired = 10000000000;

        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(STAKER_ROLE, _stakingAdmin);
    }

    /**
     * @dev stake tokens to get relayer access
     * staker should be a signer in mutisig
     */
    function stake(address _onBehalfOf, uint256 _amount) external virtual nonReentrant {
        _requireStakingLive();
        require(relayerMultisig.isOwner(_onBehalfOf), "Staking: not relayer");
        uint256 balanceOfUser = stakersAmount[_onBehalfOf];
        require(minStakeRequired <= balanceOfUser + _amount, "Staking: insufficient amount");

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
        uint256 balanceOfMessageSender = stakersAmount[msgSender];
        uint256 amountToRedeem = (_amount > balanceOfMessageSender) ? balanceOfMessageSender : _amount;
        // update this, when inactive mechanics is included
        // No need to check, as the balance will be checked in cooldown() when moving to inactive balance
        if ((balanceOfMessageSender - amountToRedeem) == 0) {
            delete stakersCooldowns[msgSender];
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
        require(stakersAmount[msg.sender] != 0, "Staking: invalid balance to cooldown");
        stakersCooldowns[msg.sender] = _blockTimestamp();
        emit CoolDownActivated(msg.sender);

        // Add inactive and active staking
        // slash will occur on total amount
        // cooldown should move the amount to inactive and can only unstake that amount
    }

    /**
     * @dev Used to toggle staking, live or pause
     */
    function toggleStaking() external virtual {
        _requireStakerRole();
        isStakingLive = !isStakingLive;
    }

    /**
     * @dev Used to update minimum staker amount required
     */
    function updateMinStakeRequired(uint256 _minStakeAmount) external virtual {
        _requireStakerRole();
        minStakeRequired = _minStakeAmount;
    }

    /**
     * @dev Update volmex safe address
     */
    function updateStakerRole(address _stakerRole) external virtual {
        _requireDefaultAdmin();
        _grantRole(STAKER_ROLE, _stakerRole);
    }

    function _requireDefaultAdmin() internal view {
        require(hasRole(DEFAULT_ADMIN_ROLE, _msgSender()), "Staking: not admin");
    }

    function _requireStakerRole() internal view {
        require(hasRole(STAKER_ROLE, _msgSender()), "Staking: not staker role");
    }

    function _requireStakingLive() private view {
        require(isStakingLive, "Staking: not live");
    }
}
