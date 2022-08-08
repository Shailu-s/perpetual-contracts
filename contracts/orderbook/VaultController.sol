// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import {
    ReentrancyGuardUpgradeable
} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { VaultControllerStorage } from "../storage/VaultControllerStorage.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { TestERC20 } from "../test/TestERC20.sol";
import { IVault } from "../interfaces/IVault.sol";
import { Vault } from "./Vault.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract VaultController is ReentrancyGuardUpgradeable, OwnerPausable, VaultControllerStorage {
    using AddressUpgradeable for address;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for uint128;
    using PerpMath for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    bool public isZkSync;

    function initialize(
        address positioningArg,
        address positioningConfig,
        address accountBalanceArg,
        address vaultImplementationArg
    ) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _positioning = positioningArg;
        _positioningConfig = positioningConfig;
        _accountBalance = accountBalanceArg;
        _vaultImplementation = vaultImplementationArg;

        // Get networkId & check for ZkSync
        uint256 networkId;
        assembly {
            networkId := chainid()
        }

        // TODO: Update ZkSync networkId (currently using 280)
        isZkSync = (networkId == 280) ? true : false;
    }

    // TODO
    //Create a setter for factory to call, to update address of any vault

    function deployVault(address _token, bool isEthVault) external onlyOwner returns (address) {
        IVault vault;
        if (isZkSync) {
            vault = new Vault();

            vault.initialize(_positioningConfig, _accountBalance, _token, address(this), isEthVault);
        } else {
            bytes32 salt = keccak256(abi.encodePacked(_token));

            vault = Vault(Clones.cloneDeterministic(_vaultImplementation, salt));
            vault.initialize(_positioningConfig, _accountBalance, _token, address(this), isEthVault);
        }
        _vaultAddress[_token] = address(vault);
        return address(vault);
    }

    function deposit(address token, uint256 amount) external payable whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0), "VC_VOTNA");
        address from = _msgSender();
        address[] storage _vaultList = _tradersVaultMap[from];
        if (IVault(_vault).getBalance(from) == 0) {
            _vaultList.push(_vault);
        }
        IVault(_vault).deposit{ value: msg.value }(token, amount, from);
    }

    function withdraw(address token, uint256 amount) external whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0), "VC_VOTNA");
        address payable to = payable(_msgSender());

        // settle all funding payments owedRealizedPnl
        // pending fee can be withdraw but won't be settled
        IPositioning(_positioning).settleAllFunding(to);

        // settle owedRealizedPnl in AccountBalance
        int256 owedRealizedPnlX10_18 = IAccountBalance(_accountBalance).settleOwedRealizedPnl(to);

        // by this time there should be no owedRealizedPnl nor pending funding payment in free collateral
        int256 freeCollateralByImRatio =
            getFreeCollateralByRatio(to, IPositioningConfig(_positioningConfig).getImRatio());

        // V_NEFC: not enough freeCollateral
        require(
            freeCollateralByImRatio + owedRealizedPnlX10_18 >= amount.toInt256(),
            "V_NEFC"
        );

        IVault(_vault).withdraw(token, amount, to);
    }

    /**
    TODO: remove pendingFee from here too
    We should also include getFreeCollateralByRatio method here
     */
    function getAccountValue(address trader) external view virtual whenNotPaused returns (int256) {
        _requireOnlyPositioning();
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        address[] storage _vaultList = _tradersVaultMap[trader];
        uint256 vaultLen = _vaultList.length;
        int256 balanceX10_18 = 0;

        for (uint256 i; i < vaultLen; i++) {
            if (_vaultList[i] != address(0)) {
                balanceX10_18 =
                    balanceX10_18 +
                    (
                        SettlementTokenMath.parseSettlementToken(
                            IVault(_vaultList[i]).getBalance(trader),
                            IVault(_vaultList[i]).decimals()
                        )
                    );
            }
        }
        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl
        return balanceX10_18 + (owedRealizedPnl - fundingPayment) + unrealizedPnl;
    }

    function getFreeCollateralByRatio(address trader, uint24 ratio) public view virtual returns (int256) {
        // conservative config: freeCollateral = min(collateral, accountValue) - margin requirement ratio
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        address[] storage _vaultList = _tradersVaultMap[trader];
        uint256 vaultLen = _vaultList.length;
        int256 balanceX10_18 = 0;

        for (uint256 i; i < vaultLen; i++) {
            if (_vaultList[i] != address(0)) {
                balanceX10_18 =
                    balanceX10_18 +
                    (
                        SettlementTokenMath.parseSettlementToken(
                            IVault(_vaultList[i]).getBalance(trader),
                            IVault(_vaultList[i]).decimals()
                        )
                    );
            }
        }
        int256 accountValue = balanceX10_18 + (owedRealizedPnl - fundingPayment);
        int256 totalCollateralValue = accountValue  + unrealizedPnl;
        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(trader, ratio);

        return
            PerpMath.min(totalCollateralValue, accountValue) - (
                totalMarginRequirementX10_18.toInt256()
            );
    }

    /// @return totalMarginRequirement with decimals == 18, for freeCollateral calculation
    function _getTotalMarginRequirement(address trader, uint24 ratio) internal view returns (uint256) {
        uint256 totalDebtValue = IAccountBalance(_accountBalance).getTotalDebtValue(trader);
        return totalDebtValue.mulRatio(ratio);
    }

    function getVault(address _token) public view returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function _requireOnlyPositioning() internal view {
        // only Positioning
        require(_msgSender() == _positioning, "CHD_OCH");
    }

    function _msgSender() internal view override( OwnerPausable) returns (address) {
        return super._msgSender();
    }

    function _msgData() internal view override(OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }
}
