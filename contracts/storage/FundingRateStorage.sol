// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";

/// @notice For future upgrades, do not change ExchangeStorageV1. Create a new
/// contract which implements ExchangeStorageV1 and following the naming convention
/// ExchangeStorageVX.
abstract contract FundingRateStorage {
    int256 internal constant _PRECISION_BASE = 1e18;
    int256 internal constant _IORACLE_BASE = 1e6;
    uint256 internal _fundingPeriod;
    IPerpetualOracle internal _perpetualOracleArg;
    IPositioningConfig public positioningConfig;
    IAccountBalance public accountBalance;
    mapping(address => uint256) internal _lastFundingIndexPrice;
    mapping(address => int256) internal _lastFundingRate;
    mapping(address => uint256) internal _lastSettledTimestampMap; // the last timestamp when funding is settled
    mapping(address => int256) internal _globalFundingGrowthMap; // base token => twPremium
    mapping(address => uint256) internal _firstTradedTimestampMap;

    uint256[50] private __gap;
}
