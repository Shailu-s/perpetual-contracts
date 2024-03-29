// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.18;
pragma abicoder v2;

import { Positioning } from "../orderbook/Positioning.sol";
import "../interfaces/IVaultController.sol";

contract PositioningMock is Positioning {
    int256 public fakeFundingPaymentX10_18;

    function mock_setFundingPaymentX10_18(int256 value) public {
        fakeFundingPaymentX10_18 = value;
    }

    function getAllPendingFundingPayment(address trader) public view override returns (int256 pendingFundingPayment) {
        return fakeFundingPaymentX10_18;
    }

    function settleAllFunding(address trader) external override {
        IVaultController(msg.sender).withdraw(msg.sender, trader, 1000000000);
    }
}
