// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "../libs/LibOrder.sol";

import "./IMarkPriceOracle.sol";
import "./IPositioning.sol";
import "./IAccountBalance.sol";

interface IVolmexPerpLimitOrder {
    struct LimitOrder {
        bytes4 orderType;
        address trader;
        uint64 deadline;
        bool isShort;
        LibAsset.Asset makeAsset;
        LibAsset.Asset takeAsset;
        uint256 salt;
        uint128 triggerPrice;
    }

    function initialize(IMarkPriceOracle _markPriceOracle, IPositioning _positioning, IAccountBalance _accountBalance, address _admin) external;
    function setMarkPriceOracle(IMarkPriceOracle _markPriceOracle) external;
}