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
        (int256 twPremium, uint256 markTwap, uint256 indexTwap) = _getFundingGlobalPremiumAndTwaps(baseToken);
        int256 userTwPremium = IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        fundingPayment = _getFundingPayment(trader, baseToken, twPremium, userTwPremium);

        uint256 timestamp = _blockTimestamp();
        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update fundingGrowthGlobal and _lastSettledTimestamp
            (
                _lastSettledTimestampMap[baseToken],
                _globalFundingGrowthMap[baseToken]
            ) = (timestamp, twPremium);
        }
        emit FundingUpdated(baseToken, markTwap, indexTwap);
        return (fundingPayment, twPremium);
    }

    /// @inheritdoc IFundingRate
    function getPendingFundingPayment(address trader, address baseToken) public view virtual override returns (int256) {
        (int256 twPremium, , ) = _getFundingGlobalPremiumAndTwaps(baseToken);
        int256 userTwPremium = IAccountBalance(_accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        return _getFundingPayment(trader, baseToken, twPremium, userTwPremium);
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
        int256 marketFundingRate = (twPremiumGrowthGlobal * _PRECISION_BASE) - (userLastTwPremiumGrowthGlobal * _PRECISION_BASE);
        int256 positionSize = IAccountBalance(_accountBalance).getPositionSize(trader, baseToken);
        pendingFundingPayment = (positionSize * marketFundingRate) / _PRECISION_BASE * _fundingPeriod;
    }

    /// @dev this function calculates the up-to-date twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return globalTwPremium only for settleFunding()
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGlobalPremiumAndTwaps(address baseToken) internal view virtual returns (int256 globalTwPremium, uint256 markTwap, uint256 indexTwap) {
        uint256 twapInterval;
        uint256 timestamp = _blockTimestamp();
        // shorten twapInterval if prior observations are not enough
        if (_firstTradedTimestampMap[baseToken] != 0) {
            twapInterval = IPositioningConfig(_positioningConfig).getTwapInterval();
            uint256 deltaTimestamp = (timestamp - _firstTradedTimestampMap[baseToken]);
            twapInterval = twapInterval < deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        markTwap = IMarkPriceOracle(_markPriceOracleArg).getCumulativePrice(twapInterval, _underlyingPriceIndex);

        (indexTwap, , ) = IIndexPriceOracle(_indexPriceOracleArg).getIndexTwap(_underlyingPriceIndex);

        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        int256 lastTwPremium= _globalFundingGrowthMap[baseToken];
        if (timestamp == lastSettledTimestamp || lastSettledTimestamp == 0) {
            // if this is the latest updated timestamp, values in _globalFundingGrowthX96Map are up-to-date already
            globalTwPremium = lastTwPremium;
        } else {
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            int256 deltaTwPremiumX96 =
                _getDeltaTwap(markTwap, indexTwap) *
                    (timestamp - lastSettledTimestamp).toInt256();
            globalTwPremium = lastTwPremium + deltaTwPremiumX96;
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
