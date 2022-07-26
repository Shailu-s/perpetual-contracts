// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { Vault } from "../orderbook/Vault.sol";
import { VaultController } from "../orderbook/VaultController.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import {
    SafeERC20Upgradeable,
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { IVault } from "../interfaces/IVault.sol";

contract VaultControllerMock is VaultController{
    using SafeMathUpgradeable for uint256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
    using SignedSafeMathUpgradeable for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    using PerpMath for int256;
    using PerpMath for uint256;
    using AddressUpgradeable for address;

    int256 public fakeOwedRealisedPnlX10_18;
    int256 public fakeFundingPaymentX10_18;
    int256 public fakeUnrealizedPnlX10_18;
    uint256 public fakePendingFeeX10_18;

    function _mock_setOwedRealisedPnlX10_18(int256 value) public {
        fakeOwedRealisedPnlX10_18 = value;
    }

    function _mock_setFundingPaymentX10_18(int256 value) public {
        fakeFundingPaymentX10_18 = value;
    }

    function _mock_setUnrealizedPnlX10_18(int256 value) public {
        fakeUnrealizedPnlX10_18 = value;
    }

        
    function _mock_setPendingFeeX10_18(uint256 value) public {
        fakePendingFeeX10_18 = value;
    }

    function getAccountValue(address trader) public override whenNotPaused nonReentrant returns (int256) {
        int256 fundingPayment = fakeFundingPaymentX10_18;
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) =
            (fakeOwedRealisedPnlX10_18, fakeUnrealizedPnlX10_18, fakePendingFeeX10_18);

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
}