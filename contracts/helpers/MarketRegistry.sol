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
    // As seen externally, ratio can not be greater than one
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

    function setMakerFeeRatio( uint24 makerFeeRatio) external override checkRatio(makerFeeRatio) onlyOwner {
        _makerFeeRatio = makerFeeRatio;
    }

    function setTakerFeeRatio( uint24 takerFeeRatio) external override checkRatio(takerFeeRatio) onlyOwner {
        _takerFeeRatio = takerFeeRatio;
    }
    
    /// @inheritdoc IMarketRegistry
    function setMaxOrdersPerMarket(uint8 maxOrdersPerMarketArg) external override onlyOwner {
        _maxOrdersPerMarket = maxOrdersPerMarketArg;
        emit MaxOrdersPerMarketChanged(maxOrdersPerMarketArg);
    }

    /// @inheritdoc IMarketRegistry
    function addBaseToken(address baseToken) external override {
        address[] storage tokensStorage = _baseTokensMarketMap;
        if (_hasBaseToken(tokensStorage, baseToken)) {
            return;
        }

        tokensStorage.push(baseToken);
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

    function getMakerFeeRatio() external view override returns (uint24) {
        return _makerFeeRatio;
    }

    function getTakerFeeRatio() external view override returns (uint24) {
        return _takerFeeRatio;
    }

    /// @inheritdoc IMarketRegistry
    function getMarketInfo(address baseToken) external view override returns (MarketInfo memory) {
        return MarketInfo({ exchangeFeeRatio: _exchangeFeeRatioMap[baseToken] });
    }

    /// @inheritdoc IMarketRegistry
    function checkBaseToken(address baseToken) external view override returns (bool) {
        address[] storage tokensStorage = _baseTokensMarketMap;
        if (_hasBaseToken(tokensStorage, baseToken)) {
            return true;
        } else {
            return false;
        }
    }

    function _hasBaseToken(address[] memory baseTokens, address baseToken) internal pure returns (bool) {
        for (uint256 i = 0; i < baseTokens.length; i++) {
            if (baseTokens[i] == baseToken) {
                return true;
            }
        }
        return false;
    }
}
