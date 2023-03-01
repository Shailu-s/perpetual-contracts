// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { BlockContext } from "../helpers/BlockContext.sol";
import { IGnosisSafe } from "../interfaces/IGnosisSafe.sol";

contract Staking is ReentrancyGuardUpgradeable, AccessControlUpgradeable, BlockContext {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    struct StakerDetails {
        uint256 cooldownStart;
        uint256 inactiveBalance;
        uint256 activeBalance;
    }

    // = keccak256("STAKER_ROLE")
    bytes32 private constant _STAKER_ROLE = 0xb9e206fa2af7ee1331b72ce58b6d938ac810ce9b5cdb65d35ab723fd67badf9e;

    IGnosisSafe public relayerMultisig;
    IERC20Upgradeable public stakedToken;
    mapping(address => StakerDetails) public staker;
    uint256 public cooldownSeconds;
    uint256 public minStakeRequired;
    bool public isStakingLive;

    event Staked(address indexed from, address indexed onBehalfOf, uint256 amount);
    event Unstaked(address indexed from, address indexed to, uint256 amount, uint256 cooldownTimestamp);
    event CooldownActivated(address indexed user, uint256 nextCooldown, uint256 inactiveBalance, uint256 activeBalance);
    event RelayerDeactivated(address indexed relayer, uint256 activeBalance);

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

        _grantRole(_STAKER_ROLE, _stakingAdmin);
        _setRoleAdmin(_STAKER_ROLE, _STAKER_ROLE);
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

        // Relayer leader calculation is directly proportional to staker's activeBalance
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
        require(inactiveBalance != 0, "Staking: nothing to unstake");
        uint256 currentTimestamp = _blockTimestamp();
        // No need to check `cooldownStartTimestamp == 0`, because this check `inactiveBalance != 0` will do.
        uint256 cooldownStartTimestamp = stakerDetails.cooldownStart;
        require(currentTimestamp > (cooldownStartTimestamp + cooldownSeconds), "Staking: insufficient cooldown");

        delete stakerDetails.cooldownStart;
        delete stakerDetails.inactiveBalance;

        IERC20Upgradeable(stakedToken).safeTransfer(_to, inactiveBalance);
        emit Unstaked(msgSender, _to, inactiveBalance, cooldownStartTimestamp + cooldownSeconds);
    }

    /**
     * @dev Activates the cooldown period to unstake
     * - It can't be called if the user has not staked
     **/
    function cooldown(uint256 _amount) external virtual {
        address msgSender = _msgSender();
        StakerDetails storage stakerDetails = staker[msgSender];
        require(stakerDetails.activeBalance != 0, "Staking: invalid balance to cooldown");
        stakerDetails.cooldownStart = _blockTimestamp();
        stakerDetails.activeBalance -= _amount;
        stakerDetails.inactiveBalance += _amount;
        emit CooldownActivated(msgSender, stakerDetails.cooldownStart, stakerDetails.inactiveBalance, stakerDetails.activeBalance);
        if (stakerDetails.activeBalance < minStakeRequired) {
            emit RelayerDeactivated(msgSender, stakerDetails.activeBalance);
        }
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

    function _requireStakerRole() internal view {
        require(hasRole(_STAKER_ROLE, _msgSender()), "Staking: not staker role");
    }

    function _requireStakingLive() private view {
        require(isStakingLive, "Staking: not live");
    }
}
