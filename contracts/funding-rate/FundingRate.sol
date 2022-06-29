// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SwapMath } from "../libs/SwapMath.sol";
import { PerpFixedPoint96 } from "../libs/PerpFixedPoint96.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { ExchangeStorageV1 } from "../storage/ExchangeStorage.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { IMarkPriceOracle } from "../interfaces/IMarkPriceOracle.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";

contract FundingRate is BlockContext, PositioningCallee, ExchangeStorageV1 {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;

    function initialize(
        address exchangeManagerArg,
        address positioningConfigArg,
        address markPriceOracleArg,
        address transferManager,
        address indexPriceOracleArg
    ) external initializer {
        // __PositioningCallee_init();
        _exchangeManager = exchangeManagerArg;

        // E_PCANC: PCA is not contract
        require(positioningConfigArg.isContract(), "E_VPMMNC");

        // update states
        _PositioningConfig = positioningConfigArg;
        _markPriceOracleArg = markPriceOracleArg;
        _indexPriceOracleArg = indexPriceOracleArg;
        _transferManager = transferManager;
    }

    /// @dev this function is used to settle funding f a trader on the basis of given basetoken
    /// @param trader address of the trader
    /// @param baseToken address of the baseToken
    /// @return fundingPayment pnding funding payment on this basetoken
    /// @return growthTwPremium global funding growth of the basetoken
    function settleFunding(address trader, address baseToken)
        public
        returns (int256 fundingPayment, int256 growthTwPremium)
    {
        _requireOnlyPositioning();

        uint256 markTwap;
        uint256 indexTwap;
        (growthTwPremium, markTwap, indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        fundingPayment = _getFundingPayment(trader, baseToken, markTwap.toInt256(), indexTwap.toInt256());

        uint256 timestamp = _blockTimestamp();
        // update states before further actions in this block; once per block
        if (timestamp != _lastSettledTimestampMap[baseToken]) {
            // update growthTwPremium and _lastSettledTimestamp
            int256 lastGrowthTwPremium = _globalFundingGrowthMap[baseToken];
            (_lastSettledTimestampMap[baseToken], lastGrowthTwPremium) = (
                timestamp,
                growthTwPremium
            );
        }
        return (fundingPayment, growthTwPremium);
    }

    /// @dev this function calculates pending funding payment of user
    /// @param markTwap only for settleFunding()
    /// @param indexTwap only for settleFunding()
    /// @return pendingFundingPayment pending funding payment of user
    function _getFundingPayment(
        address trader,
        address baseToken,
        int256 markTwap,
        int256 indexTwap
    ) internal view returns (int256 pendingFundingPayment) {
        int256 marketFundingRate = ((markTwap.sub(indexTwap)).div(indexTwap)).div(24);
        int256 PositionSize = IAccountBalance(_accountBalance).getTakerPositionSize(trader, baseToken);
        pendingFundingPayment = PositionSize.mul(marketFundingRate);
    }

    /// @dev this function calculates the up-to-date growthTwPremium and twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return growthTwPremium the up-to-date growthTwPremium
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGrowthGlobalAndTwaps(address baseToken)
        internal
        view
        returns (
            int256 growthTwPremium,
            uint256 markTwap,
            uint256 indexTwap
        )
    {
        uint32 twapInterval;
        uint256 timestamp = _blockTimestamp();
        // shorten twapInterval if prior observations are not enough
        if (_firstTradedTimestampMap[baseToken] != 0) {
            twapInterval = IPositioningConfig(_PositioningConfig).getTwapInterval();
            uint32 deltaTimestamp = timestamp.sub(_firstTradedTimestampMap[baseToken]).toUint32();
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        uint256 markTwapX96 = IMarkPriceOracle(_markPriceOracleArg).getCumulativePrice(twapInterval);
        markTwap = markTwapX96.formatX96ToX10_18();
        (indexTwap, , ) = IIndexPriceOracle(_indexPriceOracleArg).getIndexTwap(twapInterval);

        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        int lastTwPremium = _globalFundingGrowthMap[baseToken];
        if (timestamp == lastSettledTimestamp || lastSettledTimestamp == 0) {
            // if this is the latest updated timestamp, values in _globalFundingGrowthX96Map are up-to-date already
            growthTwPremium = lastTwPremium;
        } else {
            // deltaTwPremium = (markTwap - indexTwap) * (now - lastSettledTimestamp)
            int256 deltaTwPremium =
                _getDeltaTwap(markTwap, indexTwap).mul(timestamp.sub(lastSettledTimestamp).toInt256());
            growthTwPremium = lastTwPremium.add(deltaTwPremium);
        }

        return (growthTwPremium, markTwap, indexTwap);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view returns (int256 deltaTwap) {
        uint24 maxFundingRate = IPositioningConfig(_PositioningConfig).getMaxFundingRate();
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

    ///@dev this function calculates pending funding payment of a trader respective to basetoken
    function getPendingFundingPayment(address trader, address baseToken) public view returns (int256) {
        (, uint256 markTwap, uint256 indexTwap) = _getFundingGrowthGlobalAndTwaps(baseToken);

        return _getFundingPayment(trader, baseToken, markTwap.toInt256(), indexTwap.toInt256());
    }
}
