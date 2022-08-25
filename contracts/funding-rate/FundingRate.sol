// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
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

    function __FundingRate_init(
        address markPriceOracleArg,
        address indexPriceOracleArg
    ) internal onlyInitializing {
        __PositioningCallee_init();
        _markPriceOracleArg = markPriceOracleArg;
        _indexPriceOracleArg = indexPriceOracleArg;
    }

    /// @inheritdoc IFundingRate
    function settleFunding(address trader, address baseToken)
        public
        virtual
        override
        returns (int256 fundingPayment, int256 growthTwPremium)
    {

        uint256 markTwap;
        uint256 indexTwap;
        (growthTwPremium, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        fundingPayment = _getFundingPayment(trader, baseToken, markTwap.toInt256(), indexTwap.toInt256());

        uint256 timestamp = _blockTimestamp();
        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update growthTwPremium and _lastSettledTimestamp
            int256 lastGrowthTwPremium = _globalFundingGrowthMap[baseToken];
            (_lastSettledTimestampMap[baseToken], lastGrowthTwPremium) = (timestamp, growthTwPremium);
            emit FundingUpdated(baseToken, markTwap, indexTwap);
        }
        return (fundingPayment, growthTwPremium);
    }

    /**
    TODO:   we should check use cases here whether marketFundingRate goes -ve or not
     */
    /// @dev this function calculates pending funding payment of user
    /// @param markTwap only for settleFunding()
    /// @param indexTwap only for settleFunding()
    /// @return pendingFundingPayment pending funding payment of user
    function _getFundingPayment(
        address trader,
        address baseToken,
        int256 markTwap,
        int256 indexTwap
    ) internal virtual view returns (int256 pendingFundingPayment) {
        int256 marketFundingRate = ((markTwap - indexTwap) / indexTwap) / (24);
        int256 PositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
        pendingFundingPayment = PositionSize*marketFundingRate;
    }

    /// @dev this function calculates the up-to-date growthTwPremium and twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return growthTwPremium the up-to-date growthTwPremium
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGrowthGlobalAndTwaps(address baseToken)
        internal
        virtual
        view
        returns (
            int256 growthTwPremium,
            uint256 markTwap,
            uint256 indexTwap
        )
    {
        uint256 twapInterval;
        uint256 timestamp = _blockTimestamp();
        // shorten twapInterval if prior observations are not enough
        if (_firstTradedTimestampMap[baseToken] != 0) {
            twapInterval = IPositioningConfig(_PositioningConfig).getTwapInterval();
            uint256 deltaTimestamp = (timestamp - _firstTradedTimestampMap[baseToken]);
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        uint256 markTwapX96 = IMarkPriceOracle(_markPriceOracleArg).getCumulativePrice(twapInterval);
        markTwap = markTwapX96.formatX96ToX10_18();
        (indexTwap, , ) = IIndexPriceOracle(_indexPriceOracleArg).getIndexTwap(twapInterval);

        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        int256 lastTwPremium = _globalFundingGrowthMap[baseToken];
        if (timestamp == lastSettledTimestamp || lastSettledTimestamp == 0) {
            // if this is the latest updated timestamp, values in _globalFundingGrowthX96Map are up-to-date already
            growthTwPremium = lastTwPremium;
        } else {
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            int256 deltaTwPremium =
                _getDeltaTwap(markTwap, indexTwap)*((timestamp-lastSettledTimestamp).toInt256());
            growthTwPremium = lastTwPremium + deltaTwPremium;
        }

        return (growthTwPremium, markTwap, indexTwap);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view virtual returns (int256 deltaTwap) {
        uint24 maxFundingRate = IPositioningConfig(_PositioningConfig).getMaxFundingRate();
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

    /// @inheritdoc IFundingRate
    function getPendingFundingPayment(address trader, address baseToken) public view virtual override returns (int256) {
        (, uint256 markTwap, uint256 indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        return _getFundingPayment(trader, baseToken, markTwap.toInt256(), indexTwap.toInt256());
    }
}
