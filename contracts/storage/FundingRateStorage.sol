// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change ExchangeStorageV1. Create a new
/// contract which implements ExchangeStorageV1 and following the naming convention
/// ExchangeStorageVX.
abstract contract FundingRateStorage {
    address internal _orderBook;
    address internal _accountBalance;
    address internal _PositioningConfig;
    address internal _markPriceOracleArg;
    address internal _indexPriceOracleArg;

    mapping(address => uint256) internal _firstTradedTimestampMap;
    mapping(address => uint256) internal _lastSettledTimestampMap;
    // mapping basetoken => twpremium(time weighted)
    mapping(address => int256) internal _globalFundingGrowthMap;
}
