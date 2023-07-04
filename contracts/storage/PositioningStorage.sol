// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IFundingRate } from "../interfaces/IFundingRate.sol";

/// @notice For future upgrades, do not change PositioningStorageV1. Create a new
/// contract which implements PositioningStorageV1 and following the naming convention
/// PositioningStorageVX.
abstract contract PositioningStorageV1 {
    uint256 internal constant _ORACLE_BASE = 1000000;
    uint256 internal constant _ORACLE_BASE_X6 = 1000000;
    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;
    uint256 internal constant _UINT256_MAX = 2**256 - 1;
    bytes32 public constant POSITIONING_ADMIN = keccak256("POSITIONING_ADMIN");
    bytes32 public constant SM_INTERVAL_ROLE = keccak256("SM_INTERVAL_ROLE");
    bytes32 public constant CHAINLINK_TOKEN_CHECKSUM = bytes32(uint256(2 ** 255));    // CHAINLINK_TOKEN_CHECKSUM = 0x8000000000000000000000000000000000000000000000000000000000000000 id for chain link base token indexes
    uint8 internal _settlementTokenDecimals;
    address internal _matchingEngine;
    address internal _marketRegistry;
    uint256 internal _smInterval;
    uint256 internal _smIntervalLiquidation;
    address public positioningConfig;
    address public vaultController;
    address public accountBalance;
    address public defaultFeeReceiver;
    IPerpetualOracle internal _perpetualOracleArg;
    IFundingRate internal fundingRate;

    mapping(address => bool) public isLiquidatorWhitelisted;
    bool public isLiquidatorWhitelistEnabled;
    uint256 public indexPriceAllowedInterval;
    mapping(address => uint256) public minPositionSizeByBaseToken;
    mapping(address => uint256) internal _underlyingPriceIndexes;

    uint256[48] private __gap;
}
