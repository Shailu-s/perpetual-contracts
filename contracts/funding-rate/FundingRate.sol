// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { IFundingRate } from "../interfaces/IFundingRate.sol";
import { IMarkPriceOracle } from "../interfaces/IMarkPriceOracle.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";

import { BlockContext } from "../helpers/BlockContext.sol";
import { FundingRateStorage } from "../storage/FundingRateStorage.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";
import { PositioningStorageV1 } from "../storage/PositioningStorage.sol";

contract FundingRate is IFundingRate, BlockContext, PositioningCallee, FundingRateStorage, PositioningStorageV1 {
    using AddressUpgradeable for address;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibSafeCastUint for uint256;

    /// @inheritdoc IFundingRate
    function settleFunding(address trader, address baseToken) public virtual override returns (int256 fundingPayment, int256 globalTwPremiumGrowth) {
        uint256 markTwap;
        uint256 indexTwap;
        (globalTwPremiumGrowth, markTwap, indexTwap) = _getFundingGlobalPremiumAndTwaps(baseToken);
        int256 userTwPremium = IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        fundingPayment = _getFundingPayment(trader, baseToken, globalTwPremiumGrowth, userTwPremium);

        uint256 timestamp = _blockTimestamp();
        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        // update states before further actions in this funding epoch; once per epoch
        if (timestamp - lastSettledTimestamp > _fundingPeriod) {
            uint256 fundingLatestTimestamp = lastSettledTimestamp == 0 ? timestamp : lastSettledTimestamp + ((timestamp - lastSettledTimestamp) / _fundingPeriod) * _fundingPeriod;
            // update fundingGrowthGlobal and _lastSettledTimestamp
            (_lastSettledTimestampMap[baseToken], _globalFundingGrowthMap[baseToken]) = (fundingLatestTimestamp, globalTwPremiumGrowth);
            _lastFundingIndexPrice[baseToken] = indexTwap;
            emit FundingUpdated(baseToken, markTwap, indexTwap);
        }
        return (fundingPayment, globalTwPremiumGrowth);
    }

    /// @inheritdoc IFundingRate
    function getPendingFundingPayment(address trader, address baseToken) public view virtual override returns (int256) {
        (int256 twPremium, , ) = _getFundingGlobalPremiumAndTwaps(baseToken);
        int256 userTwPremium = IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        return _getFundingPayment(trader, baseToken, twPremium, userTwPremium);
    }

    /// @inheritdoc IFundingRate
    function getLastFundingRate(address baseToken) external view returns (int256 lastFundingRate) {
        if (_globalFundingGrowthMap[baseToken] == 0 || (_lastFundingIndexPrice[baseToken]).toInt256() == 0) {
            return 0;
        }
        lastFundingRate = (_globalFundingGrowthMap[baseToken] * _ORACLE_BASE_X6.toInt256()) / (_lastFundingIndexPrice[baseToken]).toInt256();
    }

    /// @inheritdoc IFundingRate
    function getNextFunding(address baseToken) external view returns (uint256 nextFunding) {
        nextFunding = block.timestamp - _lastSettledTimestampMap[baseToken]; // nextFundingInterval = Time Untill Next Funding
    }

    /// @inheritdoc IFundingRate
    function getFundingPeriod() external view returns (uint256 fundingPeriod) {
        fundingPeriod = _fundingPeriod;
    }

    function __FundingRate_init(address markPriceOracleArg, address indexPriceOracleArg) internal onlyInitializing {
        __PositioningCallee_init();
        _markPriceOracleArg = markPriceOracleArg;
        _indexPriceOracleArg = indexPriceOracleArg;
        // this shoould be the time when funding should be settled
        _fundingPeriod = 8 hours;
    }

    /// @dev this function calculates pending funding payment of user
    /// @return pendingFundingPayment pending funding payment of user
    function _getFundingPayment(
        address trader,
        address baseToken,
        int256 twPremiumGrowthGlobal,
        int256 userLastTwPremiumGrowthGlobal
    ) internal view virtual returns (int256 pendingFundingPayment) {
        if (twPremiumGrowthGlobal != 0 || userLastTwPremiumGrowthGlobal != 0) {
            int256 marketFundingRate = (twPremiumGrowthGlobal * _PRECISION_BASE) - (userLastTwPremiumGrowthGlobal * _PRECISION_BASE);
            int256 positionSize = IAccountBalance(_accountBalance).getPositionSize(trader, baseToken);
            pendingFundingPayment = (((positionSize * marketFundingRate) * _fundingPeriod.toInt256()) / _PRECISION_BASE) * 86400;
        }
    }

    /// @dev this function calculates the up-to-date twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return globalTwPremium only for settleFunding()
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGlobalPremiumAndTwaps(address baseToken)
        internal
        view
        virtual
        returns (
            int256 globalTwPremium,
            uint256 markTwap,
            uint256 indexTwap
        )
    {
        uint256 twapInterval = IPositioningConfig(_positioningConfig).getTwapInterval();
        uint256 timestamp = _blockTimestamp();
        // shorten twapInterval if prior observations are not enough
        // in first epoch, block-based funding is applicable
        if (_firstTradedTimestampMap[baseToken] != 0) {
            uint256 deltaTimestamp = (timestamp - _firstTradedTimestampMap[baseToken]);
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        globalTwPremium = _globalFundingGrowthMap[baseToken];
        if (lastSettledTimestamp == 0) {
            markTwap = IMarkPriceOracle(_markPriceOracleArg).getMarkTwap(twapInterval, _underlyingPriceIndex);
            indexTwap = IIndexPriceOracle(_indexPriceOracleArg).getLastTwap(twapInterval, _underlyingPriceIndex);
        } else if (timestamp - lastSettledTimestamp > _fundingPeriod) {
            //when funding period is over
            uint256 fundingLatestTimestamp = lastSettledTimestamp + ((timestamp - lastSettledTimestamp) / _fundingPeriod) * _fundingPeriod;
            markTwap = IMarkPriceOracle(_markPriceOracleArg).getCustomMarkTwap(_underlyingPriceIndex, lastSettledTimestamp, fundingLatestTimestamp);
            indexTwap = IIndexPriceOracle(_indexPriceOracleArg).getCustomIndexTwap(_underlyingPriceIndex, lastSettledTimestamp, fundingLatestTimestamp);
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            int256 deltaTwPremiumX96 = _getDeltaTwap(markTwap, indexTwap) * (fundingLatestTimestamp - lastSettledTimestamp).toInt256();
            globalTwPremium += deltaTwPremiumX96;
        }

        return (globalTwPremium, markTwap, indexTwap);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view virtual returns (int256 deltaTwap) {
        uint24 maxFundingRate = IPositioningConfig(_positioningConfig).getMaxFundingRate();
        uint256 maxDeltaTwap = indexTwap.mulRatio(maxFundingRate);
        uint256 absDeltaTwap;
        if (markTwap > indexTwap) {
            absDeltaTwap = markTwap - indexTwap;
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.toInt256() : absDeltaTwap.toInt256();
        } else {
            absDeltaTwap = indexTwap - markTwap;
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.neg256() : absDeltaTwap.neg256();
        }
    }
}
