// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { LibAccountMarket } from "../libs/LibAccountMarket.sol";
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";

/// @notice For future upgrades, do not change AccountBalanceStorageV1. Create a new
/// contract which implements AccountBalanceStorageV1 and following the naming convention
/// AccountBalanceStorageVX.
abstract contract AccountBalanceStorageV1 {
    int256 internal constant _ORACLE_BASE = 1000000;
    uint256 internal constant _DUST = 10 wei;
    uint256 internal constant _MIN_PARTIAL_LIQUIDATE_POSITION_VALUE = 100e18 wei; // 100 USD in decimal 18
    uint256 internal constant _SIGMA_IV_BASE = 10000;
    bytes32 public constant ACCOUNT_BALANCE_ADMIN = keccak256("ACCOUNT_BALANCE_ADMIN");
    bytes32 public constant CAN_SETTLE_REALIZED_PNL = keccak256("CAN_SETTLE_REALIZED_PNL");
    bytes32 public constant SM_INTERVAL_ROLE = keccak256("SM_INTERVAL_ROLE");
    bytes32 public constant SIGMA_IV_ROLE = keccak256("SIGMA_IV_ROLE");
    address internal _positioningConfig;
    address internal _orderBook;
    uint256 internal _smInterval;
    uint256 internal _smIntervalLiquidation;
    // trader => owedRealizedPnl
    mapping(address => int256) internal _owedRealizedPnlMap;
    // base token registry of each trader
    mapping(address => address[]) internal _baseTokensMap;
    // first key: trader, second key: baseToken
    mapping(address => mapping(address => LibAccountMarket.Info)) internal _accountMarketMap;
    // Index price oracle underlying index
    mapping(address => uint256) _underlyingPriceIndexes;
    mapping(address => uint256) public nextLiquidationTime;
    mapping(uint256 => uint256) public sigmaVolmexIvs;
    IMatchingEngine public matchingEngine;
}
