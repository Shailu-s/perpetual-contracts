// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { SafeERC20Upgradeable, IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSettlementTokenMath } from "../libs/LibSettlementTokenMath.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";

import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IVolmexPerpPeriphery } from "../interfaces/IVolmexPerpPeriphery.sol";

import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { VaultStorageV1 } from "../storage/VaultStorage.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Vault is IVault, ReentrancyGuardUpgradeable, OwnerPausable, VaultStorageV1, AccessControlUpgradeable {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibSafeCastInt for int256;
    using LibSettlementTokenMath for uint256;
    using LibSettlementTokenMath for int256;
    using LibPerpMath for int256;
    using LibPerpMath for uint256;

    modifier onlySettlementToken(address token) {
        // only settlement token
        require(_settlementToken == token, "V_OST");
        _;
    }

    function initialize(
        address positioningConfigArg,
        address accountBalanceArg,
        address tokenArg,
        address vaultControllerArg
    ) external initializer {
        uint8 decimalsArg = IERC20Metadata(tokenArg).decimals();
        // invalid settlementToken decimals
        require(decimalsArg <= 18, "V_ISTD");
        // PositioningConfig address is not contract
        require(positioningConfigArg.isContract(), "V_CHCNC");
        // accountBalance address is not contract
        require(accountBalanceArg.isContract(), "V_ABNC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        // update states
        _decimals = decimalsArg;
        _settlementToken = tokenArg;
        _positioningConfig = positioningConfigArg;
        _accountBalance = accountBalanceArg;
        _vaultController = vaultControllerArg;
        _grantRole(VAULT_ADMIN, _msgSender());
    }

    /// @inheritdoc IVault
    function setPositioning(address positioningArg) external onlyOwner {
        // V_VPMM: Positioning is not contract
        require(positioningArg.isContract(), "V_VPMM");
        _positioning = positioningArg;
    }

    /// @inheritdoc IVault
    function setVaultController(address vaultControllerArg) external {
        _requireVaultAdmin();
        // V_VPMM: Vault controller is not contract
        require(vaultControllerArg.isContract(), "V_VPMM");
        _vaultController = vaultControllerArg;
    }

    /// @inheritdoc IVault
    function deposit(
        IVolmexPerpPeriphery periphery,
        uint256 amount,
        address from
    ) external override whenNotPaused nonReentrant {
        // input requirement checks:
        //   token: here
        //   amount: here
        _requireOnlyVaultController();
        _deposit(periphery, amount, from);
    }

    /// @inheritdoc IVault
    function withdraw(uint256 amount, address to) external virtual override whenNotPaused nonReentrant {
        _requireOnlyVaultController();
        // send available funds to trader if vault balance is not enough and emit LowBalance event
        uint256 vaultBalance = IERC20Metadata(_settlementToken).balanceOf(address(this));
        uint256 remainingAmount = 0;
        if (vaultBalance < amount) {
            remainingAmount = amount - vaultBalance;
            emit LowBalance(remainingAmount); // Note: Used for monitoring service to trigger insurance-fund
        }
        amount = amount - remainingAmount;
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_settlementToken), to, amount);
        if (_checkHighWeightedAmount(vaultBalance,amount)) emit HighWeightAmountWithdrawn(to, amount);
        emit Withdrawn(_settlementToken, to, amount);
    }

    /// @inheritdoc IVault
    function transferFundToVault(address token, uint256 amount) external override whenNotPaused nonReentrant onlySettlementToken(token) {
        _requireVaultAdmin();
        address from = _msgSender();
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), from, address(this), amount);
        _totalDebt += amount;
        emit BorrowFund(from, amount);
    }

    /// @inheritdoc IVault
    function repayDebtToOwner(address token, uint256 amount) external override whenNotPaused nonReentrant onlySettlementToken(token) {
        _requireVaultAdmin();
        address to = _msgSender();
        require(_totalDebt >= amount, "V_AIMTD"); // V_AIMTD: amount is more that debt
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amount);
        _totalDebt -= amount;
        emit DebtRepayed(to, amount);
    }

    /// @inheritdoc IVault
    function setSettlementToken(address newTokenArg) external override {
        _requireVaultAdmin();
        _settlementToken = newTokenArg;
    }

    /// @inheritdoc IVault
    function getSettlementToken() external view override returns (address) {
        return _settlementToken;
    }

    /// @inheritdoc IVault
    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    /// @inheritdoc IVault
    function getTotalDebt() external view override returns (uint256) {
        return _totalDebt;
    }

    /// @inheritdoc IVault
    function getPositioningConfig() external view override returns (address) {
        return _positioningConfig;
    }

    /// @inheritdoc IVault
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IVault
    function getPositioning() external view override returns (address) {
        return _positioning;
    }

    /// @inheritdoc IVault
    function getVaultController() external view override returns (address) {
        return _vaultController;
    }

    function _deposit(
        IVolmexPerpPeriphery periphery,
        uint256 amount,
        address from
    ) internal {
        uint256 _vaultBalance;
        // check for deflationary tokens by assuring balances before and after transferring to be the same
        uint256 balanceBefore = IERC20Metadata(_settlementToken).balanceOf(address(this));
        periphery.transferToVault(IERC20Upgradeable(_settlementToken), from, amount);
        // SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), from, address(this), amount);
        // V_BAI: inconsistent balance amount, to prevent from deflationary tokens
        require((IERC20Metadata(_settlementToken).balanceOf(address(this)) - balanceBefore) == amount, "V_IBA");
        _vaultBalance = IERC20Metadata(_settlementToken).balanceOf(address(this));
        uint256 settlementTokenBalanceCap = IPositioningConfig(_positioningConfig).getSettlementTokenBalanceCap();
        // V_GTSTBC: greater than settlement token balance cap
        require(_vaultBalance <= settlementTokenBalanceCap, "V_GTSTBC");
        if (_checkHighWeightedAmount(balanceBefore, amount)) emit HighWeightAmountDeposited(from, amount);
        emit Deposited(_settlementToken, from, amount);
    }
    
    function _checkHighWeightedAmount(uint256 _vaultBalance, uint256 amount) internal pure returns (bool) {
        uint256 onePercentOfVaultBalance = _vaultBalance / 100;
        return amount >= onePercentOfVaultBalance;
    }

    function _msgSender() internal view override(ContextUpgradeable, OwnerPausable) returns (address) {
        return super._msgSender();
    }

    function _requireOnlyVaultController() internal view {
        // only VaultController
        require(_msgSender() == _vaultController, "V_OVC");
    }

    function _requireVaultAdmin() internal view {
        require(hasRole(VAULT_ADMIN, _msgSender()), "Vault: Not admin");
    }
}
