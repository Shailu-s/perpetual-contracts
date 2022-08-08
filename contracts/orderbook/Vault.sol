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
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { BaseRelayRecipient } from "../gsn/BaseRelayRecipient.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { VaultStorageV1 } from "../storage/VaultStorage.sol";
import { IVault } from "../interfaces/IVault.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Vault is IVault, ReentrancyGuardUpgradeable, OwnerPausable, BaseRelayRecipient, VaultStorageV1 {
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    using PerpMath for int256;
    using PerpMath for uint256;
    using AddressUpgradeable for address;

    event LowBalance(uint256 amount);
    event BorrowFund(address from, uint256 amount);
    event DebtRepayed(address to, uint256 amount);

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
    }

    function setPositioning(address PositioningArg) external {
        // V_VPMM: Positioning is not contract
        require(PositioningArg.isContract(), "V_VPMM");
        _Positioning = PositioningArg;
    }

    function setVaultController(address vaultControllerArg) external onlyOwner {
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

        uint256 amountToTransfer = amount;
        if (_isEthVault) {
            // not enough balance
            require(address(this).balance >= amount, "V_NEB");
            to.transfer(amount);
        } else {
            // send available funds to trader if vault balance is not enough and emit LowBalance event
            uint256 vaultBalance = IERC20Metadata(token).balanceOf(address(this));
            uint256 remainingAmount = 0;
            if (vaultBalance < amount) {
                remainingAmount = amount - vaultBalance;
                emit LowBalance(remainingAmount);
            }
            amountToTransfer = amount - remainingAmount;

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
        onlyOwner
    {
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
        onlyOwner
    {
        address to = _msgSender();
        //V_AIMTD: amount is more that debt
        require(_totalDebt >= amount, "V_AIMTD");
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amount);
        _totalDebt -= amount;
        emit DebtRepayed(to, amount);
    }

    /// @inheritdoc IVault
    function setSettlementToken(address newTokenArg) external override onlyOwner {
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

    /// @inheritdoc IVault
    function getFreeCollateralByRatio(address trader, uint24 ratio) public view virtual override returns (int256) {
        // conservative config: freeCollateral = min(collateral, accountValue) - margin requirement ratio
        int256 fundingPaymentX10_18 = IPositioning(_Positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnlX10_18, int256 unrealizedPnlX10_18 ) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);
        int256 totalCollateralValue =
            getBalance(trader) + (
                (owedRealizedPnlX10_18 - fundingPaymentX10_18).formatSettlementToken(
                    _decimals
                )
            );

        // accountValue = totalCollateralValue + totalUnrealizedPnl, in the settlement token's decimals
        int256 accountValue = totalCollateralValue + (unrealizedPnlX10_18.formatSettlementToken(_decimals));
        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(trader, ratio);

        return
            PerpMath.min(totalCollateralValue, accountValue) - (
                totalMarginRequirementX10_18.toInt256().formatSettlementToken(_decimals)
            );
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

    /// @return totalMarginRequirement with decimals == 18, for freeCollateral calculation
    function _getTotalMarginRequirement(address trader, uint24 ratio) internal view returns (uint256) {
        uint256 totalDebtValue = IAccountBalance(_accountBalance).getTotalDebtValue(trader);
        return totalDebtValue.mulRatio(ratio);
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }

    function _requireOnlyVaultController() internal view {
        // only VaultController
        require(_msgSender() == _vaultController, "V_OVC");
    }
}
