// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { PositioningConfigStorageV1 } from "../storage/PositioningConfigStorage.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract PositioningConfig is
    IPositioningConfig,
    OwnableUpgradeable,
    PositioningConfigStorageV1
{
    //
    // EVENT
    //
    event TwapIntervalChanged(uint256 twapInterval);
    event LiquidationPenaltyRatioChanged(uint24 liquidationPenaltyRatio);
    event PartialCloseRatioChanged(uint24 partialCloseRatio);
    event MaxMarketsPerAccountChanged(uint8 maxMarketsPerAccount);
    event SettlementTokenBalanceCapChanged(uint256 cap);
    event MaxFundingRateChanged(uint24 rate);

    //
    // MODIFIER
    //

    modifier checkRatio(uint24 ratio) {
        // CHC_RO: ratio overflow
        require(ratio <= 1e6, "CHC_RO");
        _;
    }

    //
    // EXTERNAL NON-VIEW
    //

    function initialize() external initializer {
        __Ownable_init();

        _maxMarketsPerAccount = type(uint8).max;
        _imRatio = 0.1e6; // initial-margin ratio, 10% in decimal 6
        _mmRatio = 0.0625e6; // minimum-margin ratio, 6.25% in decimal 6
        _liquidationPenaltyRatio = 0.025e6; // initial penalty ratio, 2.5% in decimal 6
        _partialCloseRatio = 0.25e6; // partial close ratio, 25% in decimal 6
        _partialLiquidationRatio = 0.1e6; // partial liquidation ratio, 10% in decimal 6
        _maxFundingRate = 0.1e6; // max funding rate, 10% in decimal 6
        _twapInterval = 60 minutes;
        _settlementTokenBalanceCap = 0;
    }

    function setLiquidationPenaltyRatio(uint24 liquidationPenaltyRatioArg)
        external
        checkRatio(liquidationPenaltyRatioArg)
        onlyOwner
    {
        _liquidationPenaltyRatio = liquidationPenaltyRatioArg;
        emit LiquidationPenaltyRatioChanged(liquidationPenaltyRatioArg);
    }

    function setPartialCloseRatio(uint24 partialCloseRatioArg) external checkRatio(partialCloseRatioArg) onlyOwner {
        // CHC_IPCR: invalid partialCloseRatio
        require(partialCloseRatioArg > 0, "CHC_IPCR");

        _partialCloseRatio = partialCloseRatioArg;
        emit PartialCloseRatioChanged(partialCloseRatioArg);
    }

    function setTwapInterval(uint32 twapIntervalArg) external onlyOwner {
        // CHC_ITI: invalid twapInterval
        require(twapIntervalArg != 0, "CHC_ITI");

        _twapInterval = twapIntervalArg;
        emit TwapIntervalChanged(twapIntervalArg);
    }

    function setMaxMarketsPerAccount(uint8 maxMarketsPerAccountArg) external onlyOwner {
        _maxMarketsPerAccount = maxMarketsPerAccountArg;
        emit MaxMarketsPerAccountChanged(maxMarketsPerAccountArg);
    }

    function setSettlementTokenBalanceCap(uint256 cap) external onlyOwner {
        _settlementTokenBalanceCap = cap;
        emit SettlementTokenBalanceCapChanged(cap);
    }

    function setMaxFundingRate(uint24 rate) external onlyOwner {
        _maxFundingRate = rate;
        emit MaxFundingRateChanged(rate);
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IPositioningConfig
    function getMaxMarketsPerAccount() external view override returns (uint8) {
        return _maxMarketsPerAccount;
    }

    /// @inheritdoc IPositioningConfig
    function getImRatio() external view override returns (uint24) {
        return _imRatio;
    }

    /// @inheritdoc IPositioningConfig
    function getMmRatio() external view override returns (uint24) {
        return _mmRatio;
    }

    /// @inheritdoc IPositioningConfig
    function getLiquidationPenaltyRatio() external view override returns (uint24) {
        return _liquidationPenaltyRatio;
    }

    /// @inheritdoc IPositioningConfig
    function getPartialLiquidationRatio() external view override returns (uint24) {
        return _partialLiquidationRatio;
    }

    /// @inheritdoc IPositioningConfig
    function getPartialCloseRatio() external view override returns (uint24) {
        return _partialCloseRatio;
    }

    /// @inheritdoc IPositioningConfig
    function getTwapInterval() external view override returns (uint32) {
        return _twapInterval;
    }

    /// @inheritdoc IPositioningConfig
    function getSettlementTokenBalanceCap() external view override returns (uint256) {
        return _settlementTokenBalanceCap;
    }

    /// @inheritdoc IPositioningConfig
    function getMaxFundingRate() external view override returns (uint24) {
        return _maxFundingRate;
    }
}
