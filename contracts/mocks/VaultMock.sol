// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Vault } from "../orderbook/Vault.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import {
    SafeERC20Upgradeable,
    IERC20Upgradeable
} from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract VaultMock is Vault {
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;
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

    function withdraw(
        address token,
        uint256 amountX10_D,
        address payable to
    ) external override whenNotPaused nonReentrant onlySettlementToken(token) {
        // input requirement checks:
        //   token: here
        //   amountX10_D: here

        // the full process of withdrawal:
        // 1. settle funding payment to owedRealizedPnl
        // 2. collect fee to owedRealizedPnl
        // 3. call Vault.withdraw(token, amount)
        // 4. settle pnl to trader balance in Vault
        // 5. transfer the amount to trader
        // settle all funding payments owedRealizedPnl
        // pending fee can be withdraw but won't be settled
        // IPositioning(_Positioning).settleAllFunding(to);

        // settle owedRealizedPnl in AccountBalance
        int256 owedRealizedPnlX10_18 = fakeOwedRealisedPnlX10_18;

        // by this time there should be no owedRealizedPnl nor pending funding payment in free collateral
        int256 freeCollateralByImRatioX10_D = getFreeCollateralByRatio(to, 75);
        // V_NEFC: not enough freeCollateral
        require(
            freeCollateralByImRatioX10_D + (owedRealizedPnlX10_18.formatSettlementToken(_decimals)) >=
                amountX10_D.toInt256(),
            "V_NEFC"
        );

        // send available funds to trader if vault balance is not enough and emit LowBalance event
        uint256 vaultBalanceX10_D = IERC20Metadata(token).balanceOf(address(this));
        uint256 remainingAmountX10_D = 0;
        if (vaultBalanceX10_D < amountX10_D) {
            remainingAmountX10_D = amountX10_D + (vaultBalanceX10_D);
            emit LowBalance(remainingAmountX10_D);
        }
        uint256 amountToTransferX10_D = amountX10_D + (remainingAmountX10_D);

        // settle withdrawn amount and owedRealizedPnl to collateral
        _modifyBalance(
            to,
            token,
            (amountToTransferX10_D.toInt256() - (owedRealizedPnlX10_18.formatSettlementToken(_decimals))).neg256()
        );
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(token), to, amountToTransferX10_D);

        emit Withdrawn(token, to, amountToTransferX10_D);
    }

    function getFreeCollateralByRatio(address trader, uint24 ratio) public view override returns (int256) {
        // conservative config: freeCollateral = min(collateral, accountValue) - margin requirement ratio
        int256 fundingPaymentX10_18 = fakeFundingPaymentX10_18;
        (int256 owedRealizedPnlX10_18, int256 unrealizedPnlX10_18, uint256 pendingFeeX10_18) =
            (fakeOwedRealisedPnlX10_18, fakeUnrealizedPnlX10_18, fakePendingFeeX10_18);
        int256 totalCollateralValueX10_D =
            getBalance(trader) + (
                owedRealizedPnlX10_18 - (fundingPaymentX10_18) + (pendingFeeX10_18.toInt256()).formatSettlementToken(
                    _decimals
                )
            );

        // accountValue = totalCollateralValue + totalUnrealizedPnl, in the settlement token's decimals
        int256 accountValueX10_D = totalCollateralValueX10_D + (unrealizedPnlX10_18.formatSettlementToken(_decimals));
        uint256 totalMarginRequirementX10_18 = _getTotalMarginRequirement(trader, ratio);

        return
            PerpMath.min(totalCollateralValueX10_D, accountValueX10_D) - (
                totalMarginRequirementX10_18.toInt256().formatSettlementToken(_decimals)
            );
    }
}
