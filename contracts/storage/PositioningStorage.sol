// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

/// @notice For future upgrades, do not change PositioningStorageV1. Create a new
/// contract which implements PositioningStorageV1 and following the naming convention
/// PositioningStorageVX.
abstract contract PositioningStorageV1 {
    // --------- IMMUTABLE ---------
    address internal _quoteToken;

    // cache the settlement token's decimals for gas optimization
    uint8 internal _settlementTokenDecimals;
    // --------- ^^^^^^^^^ ---------

    address internal _PositioningConfig;
    address internal _vault;
    address internal _exchange;
    address internal _orderBook;
    address internal _accountBalance;
    address internal _insuranceFund;
}
