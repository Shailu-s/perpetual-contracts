// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {
    SafeERC20Upgradeable,
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSettlementTokenMath } from "../libs/LibSettlementTokenMath.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVault } from "../interfaces/IVault.sol";

import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { RoleManager } from "../helpers/RoleManager.sol";
import { VaultStorageV1 } from "../storage/VaultStorage.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Vault is IVault, ReentrancyGuardUpgradeable, OwnerPausable, VaultStorageV1, RoleManager {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibSafeCastInt for int256;
    using LibSettlementTokenMath for uint256;
    using LibSettlementTokenMath for int256;
    using LibPerpMath for int256;
    using LibPerpMath for uint256;

    //
    // MODIFIER
    //

    modifier onlySettlementToken(address token) {
        // only settlement token
        require(_settlementToken == token, "V_OST");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        address PositioningConfigArg,
        address accountBalanceArg,
        address tokenArg,
        address vaultControllerArg,
        bool isEthVaultArg
    ) external override initializer {
        uint8 decimalsArg = 0;
        if (isEthVaultArg) {
            decimalsArg = 18;
        } else {
            decimalsArg = IERC20Metadata(tokenArg).decimals();
        }

        // invalid settlementToken decimals
        require(decimalsArg <= 18, "V_ISTD");
        // PositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "V_CHCNC");
        // accountBalance address is not contract
        require(accountBalanceArg.isContract(), "V_ABNC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        // update states
        _decimals = decimalsArg;
        _settlementToken = tokenArg;
        _PositioningConfig = PositioningConfigArg;
        _accountBalance = accountBalanceArg;
        _vaultController = vaultControllerArg;
        _isEthVault = isEthVaultArg;
        _grantRole(VAULT_ADMIN, _msgSender());
    }

    function setPositioning(address PositioningArg) external {
        // V_VPMM: Positioning is not contract
        require(PositioningArg.isContract(), "V_VPMM");
        _grantRole(CAN_MATCH_ORDERS, PositioningArg);
        _Positioning = PositioningArg;
    }

    function setVaultController(address vaultControllerArg) external {
        _requireVaultAdmin();
        _vaultController = vaultControllerArg;
    }

    /// @inheritdoc IVault
    function deposit(
        address token,
        uint256 amount,
        address from
    ) external payable override whenNotPaused nonReentrant onlySettlementToken(token) {
        // input requirement checks:
        //   token: here
        //   amount: here
        _requireOnlyVaultController();
        _deposit(token, amount, from);
    }

    function _deposit(
        address token,
        uint256 amount,
        address from
    ) internal {
        // input requirement checks:
        //   token: here
        //   amount: here
        _modifyBalance(from, token, amount.toInt256());
        uint256 _vaultBalance;
        if (_isEthVault) {
            // amount not equal
            require(msg.value == amount, "V_ANE");
            _vaultBalance = address(this).balance;
        } else {
            //amount not accepted
            require(msg.value == 0, "V_ANA");
            // check for deflationary tokens by assuring balances before and after transferring to be the same
            uint256 balanceBefore = IERC20Metadata(token).balanceOf(address(this));
            SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), from, address(this), amount);
            // V_BAI: inconsistent balance amount, to prevent from deflationary tokens
            require((IERC20Metadata(token).balanceOf(address(this)) - balanceBefore) == amount, "V_IBA");
            _vaultBalance = IERC20Metadata(token).balanceOf(address(this));
        }

        uint256 settlementTokenBalanceCap = IPositioningConfig(_PositioningConfig).getSettlementTokenBalanceCap();
        // V_GTSTBC: greater than settlement token balance cap
        require(_vaultBalance <= settlementTokenBalanceCap, "V_GTSTBC");
        emit Deposited(token, from, amount);
    }

    /// @inheritdoc IVault
    function withdraw(
        address token,
        uint256 amount,
        address payable to
    ) external virtual override whenNotPaused nonReentrant onlySettlementToken(token) {
        _requireOnlyVaultController();
        // input requirement checks:
        //   token: here
        //   amount: here

        // the full process of withdrawal:
        // 1. settle funding payment to owedRealizedPnl
        // 2. collect fee to owedRealizedPnl
        // 3. call Vault.withdraw(token, amount)
        // 4. settle pnl to trader balance in Vault
        // 5. transfer the amount to trader

        // settle owedRealizedPnl in AccountBalance
        int256 owedRealizedPnlX10_18 = IAccountBalance(_accountBalance).settleOwedRealizedPnl(to);

        uint256 amountToTransfer = amount.formatSettlementToken(_decimals);
        if (_isEthVault) {
            // not enough balance
            require(address(this).balance >= amountToTransfer, "V_NEB");
            to.transfer(amountToTransfer);
        } else {
            // send available funds to trader if vault balance is not enough and emit LowBalance event
            uint256 vaultBalance = IERC20Metadata(token).balanceOf(address(this));
            uint256 remainingAmount = 0;
            if (vaultBalance < amountToTransfer) {
                remainingAmount = amountToTransfer - vaultBalance;
                emit LowBalance(remainingAmount);
            }
            amountToTransfer = amountToTransfer - remainingAmount;

            SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amountToTransfer);
        }

        // settle withdrawn amount and owedRealizedPnl to collateral
        // TODO: Remove it from vault
        _modifyBalance(
            to,
            token,
            (amountToTransfer.toInt256() - (owedRealizedPnlX10_18.formatSettlementToken(_decimals))).neg256()
        );

        emit Withdrawn(token, to, amountToTransfer);
    }

    /// @inheritdoc IVault
    function transferFundToVault(address token, uint256 amount)
        external
        override
        whenNotPaused
        nonReentrant
        onlySettlementToken(token)
    {
        _requireVaultAdmin();
        address from = _msgSender();
        SafeERC20Upgradeable.safeTransferFrom(IERC20Upgradeable(token), from, address(this), amount);
        _totalDebt += amount;
        emit BorrowFund(from, amount);
    }

    /// @inheritdoc IVault
    function repayDebtToOwner(address token, uint256 amount)
        external
        override
        whenNotPaused
        nonReentrant
        onlySettlementToken(token)
    {
        _requireVaultAdmin();
        address to = _msgSender();
        //V_AIMTD: amount is more that debt
        require(_totalDebt >= amount, "V_AIMTD");
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amount);
        _totalDebt -= amount;
        emit DebtRepayed(to, amount);
    }

    /// @inheritdoc IVault
    function setSettlementToken(address newTokenArg) external override {
        _requireVaultAdmin();
        _settlementToken = newTokenArg;
    }

    //
    // EXTERNAL VIEW
    //

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
        return _PositioningConfig;
    }

    /// @inheritdoc IVault
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IVault
    function getPositioning() external view override returns (address) {
        return _Positioning;
    }

    function getVaultController() external view returns (address) {
        return _vaultController;
    }

    //
    // PUBLIC VIEW
    //

    // @inheritdoc IVault
    function getBalance(address trader) public view override returns (int256) {
        return _balance[trader][_settlementToken];
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @param amount can be 0; do not require this
    function _modifyBalance(
        address trader,
        address token,
        int256 amount
    ) internal {
        _balance[trader][token] = _balance[trader][token] + amount;
    }

    //
    // INTERNAL VIEW
    //

    function _msgSender() internal view override(ContextUpgradeable, OwnerPausable) returns (address) {
        return super._msgSender();
    }

    function _requireOnlyVaultController() internal view {
        // only VaultController
        require(_msgSender() == _vaultController, "V_OVC");
    }

    function _msgData() 
    internal 
    view 
    virtual 
    override(ContextUpgradeable)
    returns (bytes calldata) {
        return msg.data;
    }

    function _requireVaultAdmin() internal view {
        require(hasRole(VAULT_ADMIN, _msgSender()), "Vault: Not admin");
    }
}
