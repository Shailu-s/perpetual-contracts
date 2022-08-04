// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
pragma abicoder v2;

import { Positioning } from "../orderbook/Positioning.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";

contract PositioningMock is Positioning {
    int256 public fakeFundingPaymentX10_18;

    function mock_setFundingPaymentX10_18(int256 value) public {
        fakeFundingPaymentX10_18 = value;
    }

    function getAllPendingFundingPayment(address trader) public view override returns (int256 pendingFundingPayment) {
        return fakeFundingPaymentX10_18;
    }

    function settleAllFunding(address trader) external override {
    }
}
