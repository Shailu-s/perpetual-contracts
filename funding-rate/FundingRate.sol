// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpSafeCast } from "../lib/PerpSafeCast.sol";
import { SwapMath } from "../lib/SwapMath.sol";
import { PerpFixedPoint96 } from "../lib/PerpFixedPoint96.sol";
import { Funding } from "../lib/Funding.sol";
import { PerpMath } from "../lib/PerpMath.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract FundingRate {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SignedSafeMathUpgradeable for int24;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;

    function initialize() external initializer {}

    function settleFunding(address trader, address baseToken)
        external
        override
        returns (int256 fundingPayment, Funding.Growth memory fundingGrowthGlobal)
    {
        _requireOnlyVolmexPerpetual();

        uint256 markTwap;
        uint256 indexTwap;
        (fundingGrowthGlobal, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        fundingPayment = _getFundingPayment(trader, baseToken, markTwap, indexTwap);

        uint256 timestamp = _blockTimestamp();
        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update fundingGrowthGlobal and _lastSettledTimestamp
            Funding.Growth storage lastFundingGrowthGlobal = _globalFundingGrowthX96Map[baseToken];
            (_lastSettledTimestampMap[baseToken], lastFundingGrowthGlobal.twPremium) = (
                timestamp,
                fundingGrowthGlobal.twPremium
            );

            emit FundingUpdated(baseToken, markTwap, indexTwap);

            // update tick for price limit checks
            _lastUpdatedTickMap[baseToken] = _getTick(baseToken);
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
            twapInterval = IClearingHouseConfig(_clearingHouseConfig).getTwapInterval();
            uint32 deltaTimestamp = timestamp.sub(_firstTradedTimestampMap[baseToken]).toUint32();
            twapInterval = twapInterval > deltaTimestamp ? twapInterval : deltaTimestamp;
        }

        uint256 markTwapX96 = IMarkSMA(_markSmaArg).getCumulativePrice(twapInterval);
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
            fundingGrowthGlobal.twPremium = lastFundingGrowthGlobal.twPremium.add(deltaTwPremium);
        }

        return (fundingGrowthGlobal, markTwap, indexTwap);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view returns (int256 deltaTwap) {
        uint24 maxFundingRate = IClearingHouseConfig(_clearingHouseConfig).getMaxFundingRate();
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
