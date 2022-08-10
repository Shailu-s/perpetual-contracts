// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { IMarketRegistry } from "../interfaces/IMarketRegistry.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

import { PositioningCallee } from "./PositioningCallee.sol";
import { MarketRegistryStorageV1 } from "../storage/MarketRegistryStorage.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract MarketRegistry is IMarketRegistry, PositioningCallee, MarketRegistryStorageV1 {
    using AddressUpgradeable for address;

    //
    // MODIFIER
    //

    modifier checkRatio(uint24 ratio) {
        // ratio overflow
        require(ratio <= 1e6, "MR_RO");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address quoteTokenArg) external initializer {
        __PositioningCallee_init();

        // QuoteToken is not contract
        require(quoteTokenArg.isContract(), "MR_QTNC");

        // update states
        _quoteToken = quoteTokenArg;
        _maxOrdersPerMarket = type(uint8).max;
    }

    /// @inheritdoc IMarketRegistry
    function setFeeRatio(address baseToken, uint24 feeRatio) external override checkRatio(feeRatio) onlyOwner {
        _exchangeFeeRatioMap[baseToken] = feeRatio;
        emit FeeRatioChanged(baseToken, feeRatio);
    }

    /// @inheritdoc IMarketRegistry
    function setMaxOrdersPerMarket(uint8 maxOrdersPerMarketArg) external override onlyOwner {
        _maxOrdersPerMarket = maxOrdersPerMarketArg;
        emit MaxOrdersPerMarketChanged(maxOrdersPerMarketArg);
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IMarketRegistry
    function getQuoteToken() external view override returns (address) {
        return _quoteToken;
    }

    /// @inheritdoc IMarketRegistry
    function getMaxOrdersPerMarket() external view override returns (uint8) {
        return _maxOrdersPerMarket;
    }

    /// @inheritdoc IMarketRegistry
    function getFeeRatio(address baseToken) external view override returns (uint24) {
        return _exchangeFeeRatioMap[baseToken];
    }

    /// @inheritdoc IMarketRegistry
    function getMarketInfo(address baseToken) external view override returns (MarketInfo memory) {
        return MarketInfo({ exchangeFeeRatio: _exchangeFeeRatioMap[baseToken] });
    }
}
