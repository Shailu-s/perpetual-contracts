// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts/proxy/Clones.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibSettlementTokenMath } from "../libs/LibSettlementTokenMath.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";

import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { RoleManager } from "../helpers/RoleManager.sol";
import { TestERC20 } from "../tests/TestERC20.sol";
import { Vault } from "./Vault.sol";
import { VaultControllerStorage } from "../storage/VaultControllerStorage.sol";

contract VaultController is
    ReentrancyGuardUpgradeable,
    OwnerPausable,
    VaultControllerStorage,
    IVaultController,
    RoleManager
{
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
        // TODO: _requireOnlyFactory();
        _vaultAddress[_token] = _vault;
    }

    /// @inheritdoc IVaultController
    function deposit(address token, uint256 amount) external payable override whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0), "VC_VOTNA");

        // positioning not set
        require(_positioning != address(0), "VC_PNS");
        address from = _msgSender();

        address[] storage _vaultList = _tradersVaultMap[from];

        if (IVault(_vault).getBalance(from) == 0) {
            _vaultList.push(_vault);
        }
        IVault(_vault).deposit{ value: msg.value }(token, amount, from);
        uint256 amountX10_18 = LibSettlementTokenMath.parseSettlementToken(amount, 0);
        _modifyBalance(from, amountX10_18.toInt256());
    }

    /// @inheritdoc IVaultController
    function withdraw(address token, uint256 amount) external override whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0), "VC_VOTNA");

        // positioning not set
        require(_positioning != address(0), "VC_PNS");

        address payable to = payable(_msgSender());

        // settle all funding payments owedRealizedPnl
        IPositioning(_positioning).settleAllFunding(to);

        // settle owedRealizedPnl in AccountBalance
        int256 owedRealizedPnlX10_18 = IAccountBalance(_accountBalance).settleOwedRealizedPnl(to);

        // by this time there should be no owedRealizedPnl nor pending funding payment in free collateral
        int256 freeCollateralByImRatio =
            getFreeCollateralByRatio(to, IPositioningConfig(_positioningConfig).getImRatio());

        // V_NEFC: not enough freeCollateral
        require(freeCollateralByImRatio + owedRealizedPnlX10_18 >= amount.toInt256(), "V_NEFC");

        IVault(_vault).withdraw(token, amount, to);

        uint256 amountX10_18 = LibSettlementTokenMath.parseSettlementToken(amount, IVault(_vault).decimals());
        _modifyBalance(to, amountX10_18.neg256());
    }

    /// @inheritdoc IVaultController
    function getAccountValue(address trader) external view override whenNotPaused returns (int256) {
        _requireOnlyPositioning();
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl) = IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        int256 balanceX10_18 = getBalance(trader);

        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl
        return balanceX10_18 + (owedRealizedPnl - fundingPayment) + unrealizedPnl;
    }

    /// @inheritdoc IVaultController
    function getFreeCollateralByRatio(address trader, uint24 ratio) public view override returns (int256) {
        // conservative config: freeCollateral = min(collateral, accountValue) - margin requirement ratio
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl) = IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        int256 balanceX10_18 = getBalance(trader);
        int256 accountValue = balanceX10_18 + (owedRealizedPnl - fundingPayment);
        int256 totalCollateralValue = accountValue + unrealizedPnl;
        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(trader, ratio);

        return LibPerpMath.min(totalCollateralValue, accountValue) - (totalMarginRequirementX10_18.toInt256());
    }

    /// @inheritdoc IVaultController
    function getBalance(address trader) public view override returns (int256) {
        return _balance[trader];
    }

    /// @inheritdoc IVaultController
    function setPositioning(address PositioningArg) external {
        require(hasRole(VAULT_CONTROLLER_ADMIN, _msgSender()), "VaultController: Not admin");
        // V_VPMM: Positioning is not contract
        require(PositioningArg.isContract(), "V_VPMM");
        _positioning = PositioningArg;
    }

    /// @inheritdoc IVaultController
    function getVault(address _token) public view override returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function _requireOnlyPositioning() internal view {
        // only Positioning
        require(_msgSender() == _positioning, "CHD_OCH");
    }

    /// @return totalMarginRequirement with decimals == 18, for freeCollateral calculation
    function _getTotalMarginRequirement(address trader, uint24 ratio) internal view returns (uint256) {
        uint256 totalDebtValue = IAccountBalance(_accountBalance).getTotalDebtValue(trader);
        return totalDebtValue.mulRatio(ratio);
    }

    function _modifyBalance(address trader, int256 amount) internal {
        _balance[trader] = _balance[trader] + amount;
    }

    function _msgSender() internal view override(OwnerPausable, ContextUpgradeable) returns (address) {
        return super._msgSender();
    }
}
