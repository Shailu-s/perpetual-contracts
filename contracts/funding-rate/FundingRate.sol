// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SwapMath } from "../libs/SwapMath.sol";
import { PerpFixedPoint96 } from "../libs/PerpFixedPoint96.sol";
import { Funding } from "../libs/Funding.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { ExchangeStorageV1 } from "../storage/ExchangeStorage.sol";
import { IExchange } from "../interfaces/IExchange.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IIndexPrice } from "../interfaces/IIndexPrice.sol";
import { IMarkPriceOracle } from "../interfaces/IMarkPriceOracle.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts

contract FundingRate is BlockContext, PositioningCallee, ExchangeStorageV1{
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SignedSafeMathUpgradeable for int24;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;

    function initialize(
        address exchangeManagerArg,
        address orderBookArg,
        address PositioningConfigArg,
        address markSmaArg,
        address transferManager,
        address quoteToken
    ) external initializer {
        __PositioningCallee_init();
        _exchangeManager = exchangeManagerArg;

        // E_OBNC: OrderBook is not contract
        require(orderBookArg.isContract(), "E_OBNC");
        // E_VPMMNC: VPMM is not contract
        require(PositioningConfigArg.isContract(), "E_VPMMNC");

        // update states
        _orderBook = orderBookArg;
        _PositioningConfig = PositioningConfigArg;
        _markSmaArg = markSmaArg;
        _transferManager = transferManager;
    }

    function settleFunding(address trader, address baseToken)
        external
        returns (int256 fundingPayment, Funding.Growth memory fundingGrowthGlobal)
    {
        _requireOnlyPositioning();

        uint256 markTwap;
        uint256 indexTwap;
        (fundingGrowthGlobal, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        fundingPayment = _getFundingPayment(trader, baseToken, markTwap, indexTwap);

        uint256 timestamp = _blockTimestamp();
        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update fundingGrowthGlobal and _lastSettledTimestamp
            Funding.Growth storage lastFundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
            (_lastSettledTimestampMap[baseToken], lastFundingGrowthGlobal.twPremiumX96) = (
                timestamp,
                fundingGrowthGlobal.twPremiumX96
            );
        }
        return (fundingPayment, fundingGrowthGlobal);
    }

    /// @dev this function calculates pending funding payment of user
    /// @param markTwap only for settleFunding()
    /// @param indexTwap only for settleFunding()
    /// @return pendingFundingPayment pending funding payment of user
    function _getFundingPayment(
        address trader,
        address baseToken,
        uint256 markTwap,
        uint256 indexTwap
    ) internal view returns (int256 pendingFundingPayment) {
        // TODO Use settle funding calculation formulae
    }

    /// @dev this function calculates the up-to-date globalFundingGrowth and twaps and pass them out
    /// @return fundingGrowthGlobal the up-to-date globalFundingGrowth
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGrowthGlobalAndTwaps(address baseToken)
        internal
        view
        returns (
            Funding.Growth memory fundingGrowthGlobal,
            uint256 markTwap,
            uint256 indexTwap
        )
    {
        uint32 twapInterval;
        uint256 timestamp = _blockTimestamp();
        // shorten twapInterval if prior observations are not enough
        if (_firstTradedTimestampMap[baseToken] != 0) {
            twapInterval = IPositioningConfig(_PositioningConfig).getTwapInterval();
            // overflow inspection:
            // 2 ^ 32 = 4,294,967,296 > 100 years = 60 * 60 * 24 * 365 * 100 = 3,153,600,000
            uint32 deltaTimestamp = timestamp.sub(_firstTradedTimestampMap[baseToken]).toUint32();
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        uint256 markTwapX96 = IMarkPriceOracle(_markSmaArg).getCumulativePrice(twapInterval);
        markTwap = markTwapX96.formatX96ToX10_18();
        indexTwap = IIndexPrice(baseToken).getIndexPrice(twapInterval);


        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        Funding.Growth storage lastFundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
        if (timestamp == lastSettledTimestamp || lastSettledTimestamp == 0) {
            // if this is the latest updated timestamp, values in _globalFundingGrowthX96Map are up-to-date already
            fundingGrowthGlobal = lastFundingGrowthGlobal;
        } else {
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            int256 deltaTwPremium =
                _getDeltaTwap(markTwap, indexTwap).mul(timestamp.sub(lastSettledTimestamp).toInt256());
            fundingGrowthGlobal.twPremiumX96 = lastFundingGrowthGlobal.twPremiumX96.add(deltaTwPremium);
        }

        return (fundingGrowthGlobal, markTwap, indexTwap);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view returns (int256 deltaTwap) {
        uint24 maxFundingRate =IPositioningConfig(_PositioningConfig).getMaxFundingRate();
        uint256 maxDeltaTwap = indexTwap.mulRatio(maxFundingRate);
        uint256 absDeltaTwap;
        if (markTwap > indexTwap) {
            absDeltaTwap = markTwap.sub(indexTwap);
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.toInt256() : absDeltaTwap.toInt256();
        } else {
            absDeltaTwap = indexTwap.sub(markTwap);
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.neg256() : absDeltaTwap.neg256();
        }
    }
}
