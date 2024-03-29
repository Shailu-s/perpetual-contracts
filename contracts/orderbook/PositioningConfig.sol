// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { PositioningConfigStorageV1 } from "../storage/PositioningConfigStorage.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract PositioningConfig is IPositioningConfig, PositioningConfigStorageV1, AccessControlUpgradeable {
    event TwapIntervalChanged(uint256 twapInterval);
    event LiquidationPenaltyRatioChanged(uint24 liquidationPenaltyRatio);
    event PartialCloseRatioChanged(uint24 partialCloseRatio);
    event MaxMarketsPerAccountChanged(uint8 maxMarketsPerAccount);
    event SettlementTokenBalanceCapChanged(uint256 cap);
    event MaxFundingRateChanged(uint24 rate);
    event InitialMarginChanged(uint24 imRatio);
    event MaintenanceMarginChanged(uint24 mmRatio);
    event PartialLiquidationRatioChanged(uint24 partialLiquidationRatio);
    event LiquidatorFeeRatioChanged(uint24 protocolFeeRatio);

    modifier checkRatio(uint24 ratio) {
        // PositioningConfig: ratio overflow
        require(ratio <= 1e6, "PC_RO");
        _;
    }

    function initialize(IPerpetualOracle perpetualOracleArg) external initializer {
        _maxMarketsPerAccount = type(uint8).max;
        _imRatio = 0.2e6; // initial-margin ratio, 20% in decimal 6
        _mmRatio = 0.2e6; // minimum-margin ratio, 20% in decimal 6
        _liquidationPenaltyRatio = 0.025e6; // initial penalty ratio, 2.5% in decimal 6
        _liquidatorFeeRatio = 0.5e6; // liquidator fee ratio for which will be part of liquidation fee of _liquidationPenaltyRatio, 50%
        _partialCloseRatio = 0.25e6; // partial close ratio, 25% in decimal 6
        _partialLiquidationRatio = 0.1e6; // partial liquidation ratio, 10% in decimal 6
        _maxFundingRate = 0.0073e6; // max funding rate, 0.73% in decimal 6
        _twapInterval = 28800;
        _twapIntervalLiquidation = 3600; // 1 hour only for position size value when liquidation
        _settlementTokenBalanceCap = 0;
        perpetualOracle = perpetualOracleArg;
        _grantRole(POSITIONING_CONFIG_ADMIN, _msgSender());
    }

    function setLiquidationPenaltyRatio(uint24 liquidationPenaltyRatioArg) external checkRatio(liquidationPenaltyRatioArg) {
        _requirePositioningConfigAdmin();
        _liquidationPenaltyRatio = liquidationPenaltyRatioArg;
        emit LiquidationPenaltyRatioChanged(liquidationPenaltyRatioArg);
    }

    function setLiquidatorFeeRatio(uint24 protocolFeeRatioArg) external checkRatio(protocolFeeRatioArg) {
        _requirePositioningConfigAdmin();
        _liquidatorFeeRatio = protocolFeeRatioArg;
        emit LiquidatorFeeRatioChanged(protocolFeeRatioArg);
    }

    function setPartialCloseRatio(uint24 partialCloseRatioArg) external checkRatio(partialCloseRatioArg) {
        _requirePositioningConfigAdmin();
        // PC_IPCR: invalid partialCloseRatio
        require(partialCloseRatioArg > 0, "PC_IPCR");

        _partialCloseRatio = partialCloseRatioArg;
        emit PartialCloseRatioChanged(partialCloseRatioArg);
    }

    function setTwapInterval(uint32 twapIntervalArg) external {
        _requirePositioningConfigAdmin();
        // PC_ITI: invalid twapInterval
        require(twapIntervalArg != 0, "PC_ITI");
        _twapInterval = twapIntervalArg;
        perpetualOracle.setMarkSmInterval(twapIntervalArg);
        // positioning.setSmInterval(twapIntervalArg);
        accountBalance.setSmInterval(twapIntervalArg);
        emit TwapIntervalChanged(twapIntervalArg);
    }

    function setTwapIntervalLiquidation(uint32 twapInterval) external {
        _requirePositioningConfigAdmin();
        // PC_ITIL: invalid twapInterval in liquidation
        require(twapInterval != 0, "PC_ITIL");
        _twapIntervalLiquidation = twapInterval;
        // positioning.setSmIntervalLiquidation(twapInterval);
        accountBalance.setSmIntervalLiquidation(twapInterval);
    }

    function setMaxMarketsPerAccount(uint8 maxMarketsPerAccountArg) external {
        _requirePositioningConfigAdmin();
        _maxMarketsPerAccount = maxMarketsPerAccountArg;
        emit MaxMarketsPerAccountChanged(maxMarketsPerAccountArg);
    }

    function setSettlementTokenBalanceCap(uint256 cap) external {
        _requirePositioningConfigAdmin();
        _settlementTokenBalanceCap = cap;
        emit SettlementTokenBalanceCapChanged(cap);
    }

    function setMaxFundingRate(uint24 rate) external {
        _requirePositioningConfigAdmin();
        _maxFundingRate = rate;
        emit MaxFundingRateChanged(rate);
    }

    function setImRatio(uint24 imRatioArg) external checkRatio(imRatioArg) {
        _requirePositioningConfigAdmin();
        // PositioningConfig: Invalid Initial Margin Ratio (PC_IIMR)
        require(imRatioArg > 0, "PC_IIMR");
        _imRatio = imRatioArg;
        emit InitialMarginChanged(_imRatio);
    }

    function setMmRatio(uint24 mmRatioArg) external checkRatio(mmRatioArg) {
        _requirePositioningConfigAdmin();
        // PositioningConfig: Invalid Maintenance Margin Ratio (PC_IMMR)
        require(mmRatioArg > 0, "PC_IMMR");
        _mmRatio = mmRatioArg;
        emit MaintenanceMarginChanged(_mmRatio);
    }

    function setPartialLiquidationRatio(uint24 partialLiquidationRatioArg) external checkRatio(partialLiquidationRatioArg) {
        _requirePositioningConfigAdmin();
        // PositioningConfig: Invalid Partial Liquidation Ratio (PC_IPLR)
        require(partialLiquidationRatioArg > 0, "PC_IPLR");
        _partialLiquidationRatio = partialLiquidationRatioArg;
        emit PartialLiquidationRatioChanged(_partialLiquidationRatio);
    }

    function setPerpetualOracle(IPerpetualOracle perpetualOracleArg) external {
        _requirePositioningConfigAdmin();
        perpetualOracle = perpetualOracleArg;
    }

    function setPositioning(IPositioning positioningArg) external {
        _requirePositioningConfigAdmin();
        positioning = positioningArg;
    }

    function setAccountBalance(IAccountBalance accountBalanceArg) external {
        _requirePositioningConfigAdmin();
        accountBalance = accountBalanceArg;
    }

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

    function getLiquidatorFeeRatio() external view returns (uint24) {
        return _liquidatorFeeRatio;
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
    function getTwapInterval() external view override returns (uint256) {
        return _twapInterval;
    }

    function getTwapIntervalLiquidation() external view override returns (uint256) {
        return _twapIntervalLiquidation;
    }

    /// @inheritdoc IPositioningConfig
    function getSettlementTokenBalanceCap() external view override returns (uint256) {
        return _settlementTokenBalanceCap;
    }

    /// @inheritdoc IPositioningConfig
    function getMaxFundingRate() external view override returns (uint24) {
        return _maxFundingRate;
    }

    function _requirePositioningConfigAdmin() internal view {
        require(hasRole(POSITIONING_CONFIG_ADMIN, _msgSender()), "PositioningConfig: Not admin");
    }
}
