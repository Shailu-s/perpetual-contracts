// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

/// @notice For future upgrades, do not change VolmexPerpetualStorageV1. Create a new
/// contract which implements VolmexPerpetualStorageV1 and following the naming convention
/// VolmexPerpetualStorageVX.
abstract contract VolmexPerpetualStorageV1 {
    // --------- IMMUTABLE ---------
    address internal _quoteToken;
    address internal _uniswapV3Factory;

    // cache the settlement token's decimals for gas optimization
    uint8 internal _settlementTokenDecimals;
    // --------- ^^^^^^^^^ ---------

    address internal _VolmexPerpetualConfig;
    address internal _vault;
    address internal _exchange;
    address internal _orderBook;
    address internal _accountBalance;
    address internal _insuranceFund;
}
