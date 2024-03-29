// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;
pragma abicoder v2;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IFundingRate } from "../interfaces/IFundingRate.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { FundingRateStorage } from "../storage/FundingRateStorage.sol";

contract FundingRate is IFundingRate, FundingRateStorage, AccessControlUpgradeable {
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibSafeCastUint for uint256;

    function FundingRate_init(IPerpetualOracle perpetualOracleArg, IPositioningConfig positioningConfigArg, IAccountBalance accountBalanceArg, address admin) external initializer {
        _perpetualOracleArg = perpetualOracleArg;
        positioningConfig = positioningConfigArg;
        accountBalance = accountBalanceArg;
        _fundingPeriod = 8 hours; // this should be the time when funding should be settled
        _grantRole(FUNDINGRATE_ADMIN, admin);
        _setRoleAdmin(FUNDINGRATE_ADMIN, FUNDINGRATE_ADMIN);
    }

    function setFundingPeriod(uint256 period) external {
        _requireFundingRate();
        _fundingPeriod = period;
        emit FundingPeriodSet(period);
    }

    /// @inheritdoc IFundingRate
    function settleFunding(address trader, address baseToken, uint256 baseTokenIndex) external virtual override returns (int256 fundingPayment, int256 globalTwPremiumGrowth) {
        uint256[2] memory priceSmas; // {0: markSma, 1: indexSma}
        int256 fundingRate;
        (globalTwPremiumGrowth, priceSmas[0], priceSmas[1], fundingRate) = _getFundingGlobalPremiumAndTwaps(baseToken, baseTokenIndex);
        int256 userTwPremium = IAccountBalance(accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        fundingPayment = _getFundingPayment(trader, baseToken, globalTwPremiumGrowth, userTwPremium);

        uint256 timestamp = block.timestamp;
        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        // update states before further actions in this funding epoch; once per epoch
        if (timestamp - lastSettledTimestamp > _fundingPeriod) {
            uint256 fundingLatestTimestamp = lastSettledTimestamp == 0 ? timestamp : lastSettledTimestamp + ((timestamp - lastSettledTimestamp) / _fundingPeriod) * _fundingPeriod;
            // update fundingGrowthGlobal and _lastSettledTimestamp
            (_lastSettledTimestampMap[baseToken], _globalFundingGrowthMap[baseToken]) = (fundingLatestTimestamp, globalTwPremiumGrowth);
            _lastFundingIndexPrice[baseToken] = priceSmas[1];
            _lastFundingRate[baseToken] = fundingRate;
            emit FundingUpdated(baseToken, priceSmas[0], priceSmas[1], fundingRate);
        }
        if (_firstTradedTimestampMap[baseToken] == 0) {
            _firstTradedTimestampMap[baseToken] = block.timestamp;
        }
        return (fundingPayment, globalTwPremiumGrowth);
    }

    /// @inheritdoc IFundingRate
    function getPendingFundingPayment(address trader, address baseToken, uint256 baseTokenIndex) external view virtual override returns (int256) {
        (int256 twPremium, , , ) = _getFundingGlobalPremiumAndTwaps(baseToken, baseTokenIndex);
        int256 userTwPremium = IAccountBalance(accountBalance).getAccountInfo(trader, baseToken).lastTwPremiumGrowthGlobal;
        return _getFundingPayment(trader, baseToken, twPremium, userTwPremium);
    }

    /// @inheritdoc IFundingRate
    function getLastFundingRate(address baseToken) external view returns (int256 lastFundingRate) {
        lastFundingRate = _lastFundingRate[baseToken];
    }

    /// @inheritdoc IFundingRate
    function getNextFunding(address baseToken) external view returns (uint256 nextFunding) {
        nextFunding = block.timestamp - _lastSettledTimestampMap[baseToken]; // nextFundingInterval = Time Untill Next Funding
    }

    /// @inheritdoc IFundingRate
    function getFundingPeriod() external view returns (uint256 fundingPeriod) {
        fundingPeriod = _fundingPeriod;
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
            int256 positionSize = IAccountBalance(accountBalance).getPositionSize(trader, baseToken);
            pendingFundingPayment = (positionSize * marketFundingRate) / (_PRECISION_BASE * 86400 * _IORACLE_BASE);
        }
    }

    /// @dev this function calculates the up-to-date twaps and pass them out
    /// @param baseToken address of the baseToken
    /// @return globalTwPremium only for settleFunding()
    /// @return markTwap only for settleFunding()
    /// @return indexTwap only for settleFunding()
    function _getFundingGlobalPremiumAndTwaps(address baseToken, uint256 baseTokenIndex)
        internal
        view
        virtual
        returns (
            int256 globalTwPremium,
            uint256 markTwap,
            uint256 indexTwap,
            int256 fundingRate
        )
    {
        uint256 twapInterval = IPositioningConfig(positioningConfig).getTwapInterval();
        uint256 timestamp = block.timestamp;
        // shorten twapInterval if prior observations are not enough
        // in first epoch, block-based funding is applicable
        if (_firstTradedTimestampMap[baseToken] != 0) {
            uint256 deltaTimestamp = (timestamp - _firstTradedTimestampMap[baseToken]);
            twapInterval = twapInterval > deltaTimestamp ? deltaTimestamp : twapInterval;
        }

        uint256 lastSettledTimestamp = _lastSettledTimestampMap[baseToken];
        globalTwPremium = _globalFundingGrowthMap[baseToken];
        if (lastSettledTimestamp == 0) {
            markTwap = IPerpetualOracle(_perpetualOracleArg).lastestLastPriceSMA(baseTokenIndex, twapInterval);
            indexTwap = IPerpetualOracle(_perpetualOracleArg).latestIndexPrice(baseTokenIndex);
        } else if (timestamp - lastSettledTimestamp > _fundingPeriod) {
            //when funding period is over
            uint256 fundingLatestTimestamp = lastSettledTimestamp + ((timestamp - lastSettledTimestamp) / _fundingPeriod) * _fundingPeriod;
            markTwap = IPerpetualOracle(_perpetualOracleArg).getMarkEpochSMA(baseTokenIndex, lastSettledTimestamp, fundingLatestTimestamp);
            indexTwap = IPerpetualOracle(_perpetualOracleArg).getIndexEpochSMA(baseTokenIndex, lastSettledTimestamp, fundingLatestTimestamp);
            require(indexTwap != 0, "P_IZ"); // index epoch price zero
            int256 deltaTwap = _getDeltaTwap(markTwap, indexTwap);
            int256 deltaTwPremiumX96 = deltaTwap * (fundingLatestTimestamp - lastSettledTimestamp).toInt256();
            globalTwPremium += deltaTwPremiumX96;
            fundingRate = (deltaTwPremiumX96 * _IORACLE_BASE) / (indexTwap.toInt256() * 86400);
        }
        return (globalTwPremium, markTwap, indexTwap, fundingRate);
    }

    function _getDeltaTwap(uint256 markTwap, uint256 indexTwap) internal view virtual returns (int256 deltaTwap) {
        uint24 maxFundingRate = IPositioningConfig(positioningConfig).getMaxFundingRate();
        uint256 maxDeltaTwap = indexTwap.mulRatio(maxFundingRate) * 3; // max funding rate comes out to be 7300 but ont diving by 3 due to calulation maxDelta twap * 28800/86400 so we need to multiply it by 3 here only
        uint256 absDeltaTwap;
        if (markTwap > indexTwap) {
            absDeltaTwap = markTwap - indexTwap;
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.toInt256() : absDeltaTwap.toInt256();
        } else {
            absDeltaTwap = indexTwap - markTwap;
            deltaTwap = absDeltaTwap > maxDeltaTwap ? maxDeltaTwap.neg256() : absDeltaTwap.neg256();
        }
    }

    function _requireFundingRate() internal view {
        require(hasRole(FUNDINGRATE_ADMIN, _msgSender()), "FR_NA"); // FundingRate: Not admin
    }
}
