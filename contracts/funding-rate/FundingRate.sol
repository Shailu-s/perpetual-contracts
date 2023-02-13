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

    /// @inheritdoc IFundingRate
    function settleFunding(address trader, address baseToken) public virtual override returns (int256 fundingPayment) {
        uint256 markTwap;
        uint256 indexTwap;
        (markTwap, indexTwap) = _getTwaps(baseToken);
        fundingPayment = _getFundingPayment(trader, baseToken, markTwap, indexTwap);

        emit FundingUpdated(baseToken, markTwap, indexTwap);
        return fundingPayment;
    }

    /// @inheritdoc IFundingRate
    function getPendingFundingPayment(address trader, address baseToken) public view virtual override returns (int256) {
        (uint256 markTwap, uint256 indexTwap) = _getTwaps(baseToken);
        return _getFundingPayment(trader, baseToken, markTwap, indexTwap);
    }

    function __FundingRate_init(address markPriceOracleArg, address indexPriceOracleArg) internal onlyInitializing {
        __PositioningCallee_init();
        _markPriceOracleArg = markPriceOracleArg;
        _indexPriceOracleArg = indexPriceOracleArg;
        _fundingRateInterval = 3;
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
        uint256 markTwap,
        uint256 indexTwap
    ) internal view virtual returns (int256 pendingFundingPayment) {
        int256 marketFundingRate = (_getDeltaTwap(markTwap, indexTwap) * _PRECISION_BASE) / (indexTwap.toInt256() * _fundingRateInterval);
        int256 positionSize = IAccountBalance(_accountBalance).getPositionSize(trader, baseToken);
        pendingFundingPayment = (positionSize * marketFundingRate) / _PRECISION_BASE;
    }

    /// @dev this function calculates the up-to-date twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getTwaps(address baseToken) internal view virtual returns (uint256 markTwap, uint256 indexTwap) {
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

        return (markTwap, indexTwap);
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
