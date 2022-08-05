// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;
pragma abicoder v2;

interface IFundingRate {
    /// @notice event to emit after funding updated
    event FundingUpdated(address indexed baseToken, uint256 markTwap, uint256 indexTwap);

    /// @dev this function is used to settle funding f a trader on the basis of given basetoken
    /// @param trader address of the trader
    /// @param baseToken address of the baseToken
    /// @return fundingPayment pnding funding payment on this basetoken
    /// @return growthTwPremium global funding growth of the basetoken
    function settleFunding(address trader, address baseToken)
        external
        returns (int256 fundingPayment, int256 growthTwPremium);

    ///@dev this function calculates pending funding payment of a trader respective to basetoken
    /// @param trader address of the trader
    /// @param baseToken address of the baseToken
    function getPendingFundingPayment(address trader, address baseToken) external view returns (int256);
}
