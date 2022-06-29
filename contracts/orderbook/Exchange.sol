// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
pragma abicoder v2;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { SwapMath } from "../libs/SwapMath.sol";
import { PerpFixedPoint96 } from "../libs/PerpFixedPoint96.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { AccountMarket } from "../libs/AccountMarket.sol";
import { IIndexPrice } from "../interfaces/IIndexPrice.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";
import { IOrderBook } from "../interfaces/IOrderBook.sol";
import { IMarketRegistry } from "../interfaces/IMarketRegistry.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { ExchangeStorageV1 } from "../storage/ExchangeStorage.sol";
import { IExchange } from "../interfaces/IExchange.sol";
import { OpenOrder } from "../libs/OpenOrder.sol";
import { IMarkPriceOracle } from "../interfaces/IMarkPriceOracle.sol";
import { IExchangeManager } from "../interfaces/IExchangeManager.sol";
import { FullMath } from "@uniswap/v3-core/contracts/libraries/FullMath.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract Exchange is IExchange, BlockContext, PositioningCallee, ExchangeStorageV1 {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using SignedSafeMathUpgradeable for int24;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for int256;

    //
    // STRUCT
    //

    struct InternalReplaySwapParams {
        address baseToken;
        bool isBaseToQuote;
        bool isExactInput;
        uint256 amount;
        uint160 sqrtPriceLimitX96;
    }

    struct InternalSwapResponse {
        int256 base;
        int256 quote;
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        uint256 fee;
        uint256 insuranceFundFee;
    }

    struct InternalRealizePnlParams {
        address trader;
        address baseToken;
        int256 takerPositionSize;
        int256 takerOpenNotional;
        int256 base;
        int256 quote;
    }

    //
    // CONSTANT
    //

    uint256 internal constant _FULLY_CLOSED_RATIO = 1e18;
    uint24 internal constant _MAX_TICK_CROSSED_WITHIN_BLOCK_CAP = 1000; // 10%
    address internal _quoteToken;

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        address exchangeManagerArg,
        address orderBookArg,
        address PositioningConfigArg,
        address markPriceOracleArg,
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
        _markPriceOracleArg = markPriceOracleArg;
        _transferManager = transferManager;
        _quoteToken = quoteToken;
    }

    /// @param accountBalanceArg: AccountBalance contract address
    function setAccountBalance(address accountBalanceArg) external onlyOwner {
        // accountBalance is 0
        require(accountBalanceArg != address(0), "E_AB0");
        _accountBalance = accountBalanceArg;
        emit AccountBalanceChanged(accountBalanceArg);
    }

    function swap(SwapParams memory params1, SwapParams memory params2)
        external
        override
        returns (SwapResponse memory)
    {
        _requireOnlyPositioning();

        int256 takerPositionSize =
            IAccountBalance(_accountBalance).getTakerPositionSize(params2.trader, params2.baseToken);

        // get openNotional before swap
        int256 oldTakerOpenNotional =
            IAccountBalance(_accountBalance).getTakerOpenNotional(params2.trader, params2.baseToken);
        InternalSwapResponse memory response = _swap(params1, params2);

        // when takerPositionSize < 0, it's a short position
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != params2.isShort;
        // when reducing/not increasing the position size, it's necessary to realize pnl
        int256 pnlToBeRealized;
        if (isReducingPosition) {
            pnlToBeRealized = _getPnlToBeRealized(
                InternalRealizePnlParams({
                    trader: params1.trader,
                    baseToken: params1.baseToken,
                    takerPositionSize: takerPositionSize,
                    takerOpenNotional: oldTakerOpenNotional,
                    base: response.base,
                    quote: response.quote
                })
            );
        }

        return
            SwapResponse({
                base: response.base.abs(),
                quote: response.quote.abs(),
                exchangedPositionSize: response.exchangedPositionSize,
                exchangedPositionNotional: response.exchangedPositionNotional,
                fee: response.fee,
                insuranceFundFee: response.insuranceFundFee,
                pnlToBeRealized: pnlToBeRealized
            });
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IExchange
    function getOrderBook() external view override returns (address) {
        return _orderBook;
    }

    /// @inheritdoc IExchange
    function getAccountBalance() external view override returns (address) {
        return _accountBalance;
    }

    /// @inheritdoc IExchange
    function getPositioningConfig() external view override returns (address) {
        return _PositioningConfig;
    }

    /// @inheritdoc IExchange
    function getPnlToBeRealized(RealizePnlParams memory params) external view override returns (int256) {
        AccountMarket.Info memory info =
            IAccountBalance(_accountBalance).getAccountInfo(params.trader, params.baseToken);

        int256 takerOpenNotional = info.takerOpenNotional;
        int256 takerPositionSize = info.takerPositionSize;
        // when takerPositionSize < 0, it's a short position; when base < 0, isBaseToQuote(shorting)
        bool isReducingPosition = takerPositionSize == 0 ? false : takerPositionSize < 0 != params.base < 0;

        return
            isReducingPosition
                ? _getPnlToBeRealized(
                    InternalRealizePnlParams({
                        trader: params.trader,
                        baseToken: params.baseToken,
                        takerPositionSize: takerPositionSize,
                        takerOpenNotional: takerOpenNotional,
                        base: params.base,
                        quote: params.quote
                    })
                )
                : 0;
    }

    //
    // INTERNAL NON-VIEW
    //

    /// @dev customized fee: https://www.notion.so/perp/Customise-fee-tier-on-B2QFee-1b7244e1db63416c8651e8fa04128cdb
    function _swap(SwapParams memory left, SwapParams memory right) internal returns (InternalSwapResponse memory) {
        (int256 base, int256 quote) =
            IExchangeManager(_exchangeManager).exchangePosition(
                left.trader,
                IExchangeManager.AssetType({ token: left.baseToken, amount: left.amount, isBase: true }),
                right.trader,
                IExchangeManager.AssetType({ token: _quoteToken, amount: right.amount, isBase: false })
            );
        // as we charge fees in Positioning,
        // we need to scale up base or quote amounts to get the exact exchanged position size and notional
        int256 exchangedPositionSize;
        int256 exchangedPositionNotional;
        // short: exchangedPositionSize <= 0 && exchangedPositionNotional >= 0
        exchangedPositionSize = base;
        // due to base to quote fee, exchangedPositionNotional contains the fee
        // s.t. we can take the fee away from exchangedPositionNotional
        exchangedPositionNotional = quote;

        // update the timestamp of the first tx in this market
        if (_firstTradedTimestampMap[left.baseToken] == 0) {
            _firstTradedTimestampMap[left.baseToken] = _blockTimestamp();
        }

        return
            InternalSwapResponse({
                base: exchangedPositionSize,
                quote: exchangedPositionNotional,
                exchangedPositionSize: exchangedPositionSize,
                exchangedPositionNotional: exchangedPositionNotional,
                fee: 0,
                insuranceFundFee: 0
            });
    }

    function _getPnlToBeRealized(InternalRealizePnlParams memory params) internal pure returns (int256) {
        // closedRatio is based on the position size
        uint256 closedRatio = FullMath.mulDiv(params.base.abs(), _FULLY_CLOSED_RATIO, params.takerPositionSize.abs());

        int256 pnlToBeRealized;
        // if closedRatio <= 1, it's reducing or closing a position; else, it's opening a larger reverse position
        if (closedRatio <= _FULLY_CLOSED_RATIO) {
            // https://docs.google.com/spreadsheets/d/1QwN_UZOiASv3dPBP7bNVdLR_GTaZGUrHW3-29ttMbLs/edit#gid=148137350
            // taker:
            // step 1: long 20 base
            // openNotionalFraction = 252.53
            // openNotional = -252.53
            // step 2: short 10 base (reduce half of the position)
            // quote = 137.5
            // closeRatio = 10/20 = 0.5
            // reducedOpenNotional = openNotional * closedRatio = -252.53 * 0.5 = -126.265
            // realizedPnl = quote + reducedOpenNotional = 137.5 + -126.265 = 11.235
            // openNotionalFraction = openNotionalFraction - quote + realizedPnl
            //                      = 252.53 - 137.5 + 11.235 = 126.265
            // openNotional = -openNotionalFraction = 126.265

            // overflow inspection:
            // max closedRatio = 1e18; range of oldOpenNotional = (-2 ^ 255, 2 ^ 255)
            // only overflow when oldOpenNotional < -2 ^ 255 / 1e18 or oldOpenNotional > 2 ^ 255 / 1e18
            int256 reducedOpenNotional = params.takerOpenNotional.mulDiv(closedRatio.toInt256(), _FULLY_CLOSED_RATIO);
            pnlToBeRealized = params.quote.add(reducedOpenNotional);
        } else {
            // https://docs.google.com/spreadsheets/d/1QwN_UZOiASv3dPBP7bNVdLR_GTaZGUrHW3-29ttMbLs/edit#gid=668982944
            // taker:
            // step 1: long 20 base
            // openNotionalFraction = 252.53
            // openNotional = -252.53
            // step 2: short 30 base (open a larger reverse position)
            // quote = 337.5
            // closeRatio = 30/20 = 1.5
            // closedPositionNotional = quote / closeRatio = 337.5 / 1.5 = 225
            // remainsPositionNotional = quote - closedPositionNotional = 337.5 - 225 = 112.5
            // realizedPnl = closedPositionNotional + openNotional = -252.53 + 225 = -27.53
            // openNotionalFraction = openNotionalFraction - quote + realizedPnl
            //                      = 252.53 - 337.5 + -27.53 = -112.5
            // openNotional = -openNotionalFraction = remainsPositionNotional = 112.5

            // overflow inspection:
            // max & min tick = 887272, -887272; max liquidity = 2 ^ 128
            // max quote = 2^128 * (sqrt(1.0001^887272) - sqrt(1.0001^-887272)) = 6.276865796e57 < 2^255 / 1e18
            int256 closedPositionNotional = params.quote.mulDiv(int256(_FULLY_CLOSED_RATIO), closedRatio);
            pnlToBeRealized = params.takerOpenNotional.add(closedPositionNotional);
        }

        return pnlToBeRealized;
    }
}
