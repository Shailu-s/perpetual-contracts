// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibSettlementTokenMath } from "../libs/LibSettlementTokenMath.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";
import { IVolmexPerpPeriphery } from "../interfaces/IVolmexPerpPeriphery.sol";

import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { VaultControllerStorage } from "../storage/VaultControllerStorage.sol";

contract VaultController is ReentrancyGuardUpgradeable, OwnerPausable, VaultControllerStorage, IVaultController, AccessControlUpgradeable {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibSettlementTokenMath for uint256;

    function initialize(address positioningConfig, address accountBalanceArg) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _positioningConfig = positioningConfig;
        _accountBalance = accountBalanceArg;
        _grantRole(VAULT_CONTROLLER_ADMIN, _msgSender());
    }

    /// @inheritdoc IVaultController
    function registerVault(address _vault, address _token) external override {
        _requireOnlyVaultControllerAdmin();
        _vaultAddress[_token] = _vault;
    }

    function deposit(
        IVolmexPerpPeriphery periphery,
        address token,
        address from,
        uint256 amount
    ) external payable override whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0), "VC_VOTNA");

        // positioning not set
        require(_positioning != address(0), "VC_PNS");

        // VC_CWZA: can't deposit zero amount
        require(amount > 0, "VC_CDZA");

        IVault(_vault).deposit{ value: msg.value }(periphery, amount, from);

        uint256 amountX10_18 = LibSettlementTokenMath.parseSettlementToken(amount, IVault(_vault).decimals());
        _modifyBalance(from, token, amountX10_18.toInt256(), _vault);
    }

    function withdraw(
        address token,
        address payable to,
        uint256 amount
    ) external override whenNotPaused nonReentrant {
        // the full process of withdrawal:
        // 1. settle funding payment to owedRealizedPnl
        // 2. collect fee to owedRealizedPnl
        // 3. call Vault.withdraw(token, amount)
        // 4. settle pnl to trader balance in Vault
        // 5. transfer the amount to trader

        address _vault = getVault(token);
        // VC_VOTNA: vault of token is not available
        require(_vault != address(0), "VC_VOTNA");

        // VC_PNS: positioning not set
        require(_positioning != address(0), "VC_PNS");

        // VC_CWZA: can't withdraw zero amount
        require(amount > 0, "VC_CWZA");

        // settle all funding payments owedRealizedPnl
        IPositioning(_positioning).settleAllFunding(to);
        // by this time there should be no owedRealizedPnl nor pending funding payment in free collateral
        int256 freeCollateralByImRatio = getFreeCollateralByRatio(to, IPositioningConfig(_positioningConfig).getImRatio());

        uint256 amountX10_18 = LibSettlementTokenMath.parseSettlementToken(amount, IVault(_vault).decimals());
        // V_NEFC: not enough freeCollateral
        require(freeCollateralByImRatio >= amountX10_18.toInt256(), "V_NEFC");
        int256 deltaBalance = amountX10_18.toInt256().neg256();

        // settle owedRealizedPnl in AccountBalance
        int256 owedRealizedPnlX10_18 = IAccountBalance(_accountBalance).settleOwedRealizedPnl(to);
        deltaBalance = deltaBalance + owedRealizedPnlX10_18;
        _modifyBalance(to, token, deltaBalance, _vault);
        IVault(_vault).withdraw(amount, to);
    }

    /// @inheritdoc IVaultController
    function setPositioning(address PositioningArg) external {
        _requireOnlyVaultControllerAdmin();
        // V_VPMM: Positioning is not contract
        require(PositioningArg.isContract(), "V_VPMM");
        _positioning = PositioningArg;
    }

    /// @inheritdoc IVaultController
    function getAccountValue(address trader) external view override whenNotPaused returns (int256) {
        return _getAccountValue(trader);
    }

    /// @inheritdoc IVaultController
    function getFreeCollateralByRatio(address trader, uint24 ratio) public view override returns (int256) {
        // conservative config: freeCollateral = min(collateral, accountValue) - margin requirement ratio
        (, int256 unrealizedPnl) = IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        int256 accountValue = _getAccountValue(trader);
        int256 totalCollateralValue = accountValue - unrealizedPnl;

        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(trader, ratio);

        return LibPerpMath.min(totalCollateralValue, accountValue) - (totalMarginRequirementX10_18.toInt256());
    }

    /// @inheritdoc IVaultController
    function getBalance(address trader) public view override returns (int256 balanceX10_18) {
        address[] storage _vaultList = _tradersVaultMap[trader];
        uint256 len = _vaultList.length;
        for (uint256 i = 0; i < len; i++) {
            if (_vaultList[i] != address(0)) {
                address token = IVault(_vaultList[i]).getSettlementToken();
                balanceX10_18 += _balance[trader][token];
            }
        }
    }

    function getBalanceByToken(address trader, address token) public view override returns (int256 balanceX10_18) {
        return _balance[trader][token];
    }

    /// @inheritdoc IVaultController
    function getVault(address _token) public view override returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function _modifyBalance(
        address trader,
        address token,
        int256 amount,
        address vaultAddress
    ) internal {
        address[] storage _vaultList = _tradersVaultMap[trader];

        if (_balance[trader][token] == 0) {
            _vaultList.push(vaultAddress);
        }

        _balance[trader][token] = _balance[trader][token] + amount;
        if (_balance[trader][token] <= 0) {
            uint256 len = _vaultList.length;
            for (uint256 i = 0; i < len; i++) {
                if (_vaultList[i] == vaultAddress) {
                    delete _vaultList[i];
                }
            }
        }
    }

    function _requireOnlyPositioning() internal view {
        // only Positioning
        require(_msgSender() == _positioning, "CHD_OP");
    }

    function _getAccountValue(address trader) internal view returns (int256) {
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl) = IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);
        int256 balanceX10_18 = getBalance(trader);
        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl

        return balanceX10_18 + (owedRealizedPnl - fundingPayment) + unrealizedPnl;
    }

    /// @return totalMarginRequirement with decimals == 18, for freeCollateral calculation
    function _getTotalMarginRequirement(address trader, uint24 ratio) internal view returns (uint256) {
        uint256 totalDebtValue = IAccountBalance(_accountBalance).getTotalDebtValue(trader);
        return totalDebtValue.mulRatio(ratio);
    }

    function _msgSender() internal view override(OwnerPausable, ContextUpgradeable) returns (address) {
        return super._msgSender();
    }

    function _requireOnlyVaultControllerAdmin() internal view {
        require(hasRole(VAULT_CONTROLLER_ADMIN, _msgSender()), "VaultController: Not admin");
    }
}
