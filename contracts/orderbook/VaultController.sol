// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { BaseRelayRecipient } from "../gsn/BaseRelayRecipient.sol";
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

contract VaultController is ReentrancyGuardUpgradeable, BaseRelayRecipient, OwnerPausable, VaultControllerStorage {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for uint128;
    using PerpMath for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;

    function initialize(address positioningArg, address accountBalanceArg) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _positioning = positioningArg;
        _accountBalance = accountBalanceArg;
    }

    // function setVault(address _vault, address _token) public {
    //     _vaultAddress[_token] = _vault;
    // }

    function getVault(address _token) public view returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function deposit(address token, uint256 amountX10_D) external {
        address _vault = getVault(token);
        address from = _msgSender();
        IVault(_vault).deposit(token, amountX10_D, from);
        address[] storage _vaultList = _tradersVaultMap[from];
        if (IVault(_vault).getBalance(from) == 0) {
            _vaultList.push(_vault);
        }
    }

    function withdraw(address token, uint256 amountX10_D) external {
        address _vault = getVault(token);
        address to = _msgSender();
        IVault(_vault).withdraw(token, amountX10_D, to);
    }

    function getAccountValue(address trader) public view returns (int256) {
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        address[] storage _vaultList = _tradersVaultMap[trader];
        uint256 vaultLen = _vaultList.length;
        int256 balanceX10_18 = 0;

        for (uint256 i; i < vaultLen; i++) {
            balanceX10_18 = balanceX10_18.add(
                SettlementTokenMath.parseSettlementToken(
                    IVault(_vaultList[i]).getBalance(trader),
                    IVault(_vaultList[i]).decimals()
                )
            );
        }
        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl + pendingMakerFee
        return balanceX10_18.add(owedRealizedPnl.sub(fundingPayment)).add(unrealizedPnl).add(pendingFee.toInt256());
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address payable) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }
}
