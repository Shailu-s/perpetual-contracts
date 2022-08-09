// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;
pragma abicoder v2;

import { AccountBalance } from "../orderbook/AccountBalance.sol";

contract AccountBalanceMock is AccountBalance {
    int256 public fakeOwedRealisedPnlX10_18;
    int256 public fakeUnrealizedPnlX10_18;
    uint256 public fakePendingFeeX10_18;

    function mock_setOwedRealisedPnlX10_18(int256 value) public {
        fakeOwedRealisedPnlX10_18 = value;
    }

    function mock_setUnrealizedPnlX10_18(int256 value) public {
        fakeUnrealizedPnlX10_18 = value;
    }

    function mock_setPendingFeeX10_18(uint256 value) public {
        fakePendingFeeX10_18 = value;
    }

    function getPnlAndPendingFee(address trader)
        external
        view
        override
        returns (
            int256,
            int256,
            uint256
        )
    {
        return (fakeOwedRealisedPnlX10_18, fakeUnrealizedPnlX10_18, fakePendingFeeX10_18);
    }
}
