// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { IAccountBalance } from "./IAccountBalance.sol";
import { IPerpetualOracle } from "./IPerpetualOracle.sol";
import { IPositioningConfig } from "./IPositioningConfig.sol";

interface IFundingRate {
    /// @notice event to emit after funding updated
    event FundingUpdated(address indexed baseToken, uint256 markTwap, uint256 indexTwap, int256 fundingRate);

    function FundingRate_init(IPerpetualOracle perpetualOracleArg, IPositioningConfig positioningConfigArg, IAccountBalance accountBalanceArg) external;
    /// @dev this function is used to settle funding f a trader on the basis of given basetoken
    /// @param trader address of the trader
    /// @param baseToken address of the baseToken
    /// @return fundingPayment pnding funding payment on this basetoken
    function settleFunding(address trader, address baseToken, uint256 baseTokenIndex) external returns (int256 fundingPayment, int256 globalTwPremiumGrowth);
    ///@dev this function calculates pending funding payment of a trader respective to basetoken
    /// @param trader address of the trader
    /// @param baseToken address of the baseToken
    function getPendingFundingPayment(address trader, address baseToken, uint256 baseTokenIndex) external view returns (int256);
    /// @dev get last funding rate = _globalFundingGrowthMap[baseToken] / indexPrice (of that funding period)
    /// @param baseToken Address of base asset in perp
    function getLastFundingRate(address baseToken) external view returns (int256 lastFundingRate);
    /// @dev get time until next funding is seconds
    /// @param baseToken Address of base asset in perp
    function getNextFunding(address baseToken) external view returns (uint256 nextFundingInterval);
    /// @dev get funding period
    function getFundingPeriod() external view returns (uint256 fundingPeriod);
}
