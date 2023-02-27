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

    struct StakerDetails {
        uint256 cooldown;
        uint256 inactiveBalance;
        uint256 activeBalance;
    }

    bytes32 public constant STAKER_ROLE = keccak256("STAKER_ROLE");

    IGnosisSafe public relayerMultisig;
    IERC20Upgradeable public stakedToken;
    uint256 public cooldownSeconds;
    mapping(address => StakerDetails) public staker;
    bool public isStakingLive;
    uint256 public minStakeRequired;

    event Staked(address indexed from, address indexed onBehalfOf, uint256 amount);
    event Unstaked(address indexed from, address indexed to, uint256 amount, uint256 cooldownTimestamp);
    event CooldownActivated(address indexed user, uint256 nextCooldown, uint256 inactiveBalance, uint256 activeBalance);

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
        StakerDetails storage stakerDetails = staker[_onBehalfOf];
        uint256 balanceOfUser = stakerDetails.activeBalance;
        require(minStakeRequired <= balanceOfUser + _amount, "Staking: insufficient amount");

        stakerDetails.activeBalance += _amount;
        stakedToken.safeTransferFrom(msg.sender, address(this), _amount);

        emit Staked(msg.sender, _onBehalfOf, _amount);
    }

    /**
     * @dev unstake staked tokens
     * @param _to Address to transfer tokens to
     **/
    function unstake(address _to) external virtual nonReentrant {
        address msgSender = _msgSender();
        StakerDetails storage stakerDetails = staker[msgSender];
        uint256 inactiveBalance = stakerDetails.inactiveBalance;
        require(inactiveBalance != 0, "Staking: insufficient inactive balance");
        uint256 currentTimestamp = _blockTimestamp();
        uint256 cooldownStartTimestamp = stakerDetails.cooldown;
        require(currentTimestamp > (cooldownStartTimestamp + cooldownSeconds), "Staking: insufficient cooldown");

        delete stakerDetails.cooldown;
        delete stakerDetails.inactiveBalance;

        IERC20Upgradeable(stakedToken).safeTransfer(_to, inactiveBalance);
        emit Unstaked(msgSender, _to, inactiveBalance, cooldownStartTimestamp + cooldownSeconds);
    }

    /**
     * @dev Activates the cooldown period to unstake
     * - It can't be called if the user is not staking
     **/
    function cooldown(uint256 _amount) external virtual {
        address msgSender = _msgSender();
        require(staker[msgSender].activeBalance != 0, "Staking: invalid balance to cooldown");
        StakerDetails storage stakerDetails = staker[msgSender];
        stakerDetails.cooldown = _blockTimestamp();
        stakerDetails.activeBalance -= _amount;
        stakerDetails.inactiveBalance += _amount;
        emit CooldownActivated(msgSender, stakerDetails.cooldown, stakerDetails.inactiveBalance, stakerDetails.activeBalance);
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
