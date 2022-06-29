// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { OpenOrder } from "../libs/OpenOrder.sol";

interface IOrderBook {

    struct MintCallbackData {
        address trader;
        address pool;
    }

    /// @notice Emitted when the `Exchange` contract address changed
    /// @param exchange The address of exchange contract
    event ExchangeChanged(address indexed exchange);

    function updateOrderDebt(
        bytes32 orderId,
        int256 base,
        int256 quote
    ) external;

    /// @notice Get open order ids of a trader in the given market
    /// @param trader The trader address
    /// @param baseToken The base token address
    /// @return orderIds The open order ids
    function getOpenOrderIds(address trader, address baseToken) external view returns (bytes32[] memory);

    /// @notice Get open order info by given order id
    /// @param orderId The order id
    /// @return info The open order info encoded in `OpenOrder.Info`
    function getOpenOrderById(bytes32 orderId) external view returns (OpenOrder.Info memory);

    /// @notice Get open order info by given base token, upper tick and lower tick
    /// @param trader The trader address
    /// @param baseToken The base token address
    /// @param upperTick The upper tick
    /// @param lowerTick The lower tick
    /// @return info he open order info encoded in `OpenOrder.Info`
    function getOpenOrder(
        address trader,
        address baseToken,
        int24 lowerTick,
        int24 upperTick
    ) external view returns (OpenOrder.Info memory);

    /// @notice Check if the specified trader has order in given markets
    /// @param trader The trader address
    /// @param tokens The base token addresses
    /// @return hasOrder True if the trader has order in given markets
    function hasOrder(address trader, address[] calldata tokens) external view returns (bool);

    /// @notice Get the total quote token amount and pending fees of all orders in given markets
    /// @param trader The trader address
    /// @param baseTokens The base token addresses
    /// @return totalQuoteAmountInPools The total quote token amount
    /// @return totalPendingFee The total pending fees in the orders
    function getTotalQuoteBalanceAndPendingFee(address trader, address[] calldata baseTokens)
        external
        view
        returns (int256 totalQuoteAmountInPools, uint256 totalPendingFee);

    /// @notice Get the total token amount (quote or base) and pending fees of all orders in the given market
    /// @param trader The trader address
    /// @param baseToken The base token addresses
    /// @param fetchBase True if fetch base token amount, false if fetch quote token amount
    /// @return tokenAmount The total quote/helpers token amount
    /// @return totalPendingFee The total pending fees in the orders
    function getTotalTokenAmountInPoolAndPendingFee(
        address trader,
        address baseToken,
        bool fetchBase
    ) external view returns (uint256 tokenAmount, uint256 totalPendingFee);

    /// @notice Get the total debt token amount (base or quote) of all orders in the given market
    /// @param trader The trader address
    /// @param baseToken The base token address
    /// @param fetchBase True if fetch base token amount, false if fetch quote token amount
    /// @return debtAmount The total debt token amount
    function getTotalOrderDebt(
        address trader,
        address baseToken,
        bool fetchBase
    ) external view returns (uint256);

    /// @notice Get the pending fees of a order
    /// @param trader The trader address
    /// @param baseToken The base token address
    /// @param lowerTick The lower tick
    /// @param upperTick The upper tick
    /// @return fee The pending fees
    function getPendingFee(
        address trader,
        address baseToken,
        int24 lowerTick,
        int24 upperTick
    ) external view returns (uint256);

    /// @notice Get `Exchange` contract address
    /// @return exchange The `Exchange` contract address
    function getExchange() external view returns (address);
}
