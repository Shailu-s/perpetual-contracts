// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;


interface IExchangeManager {
    struct AssetType {
        address token;
        uint256 amount;
        bool isBase;
    }

    function markPrice(uint8 index) external view returns (uint160);

    function exchangePosition(
        address maker,
        AssetType memory makerAsset,
        address taker,
        AssetType memory takerAsset
    ) external returns (int256, int256);
} 
