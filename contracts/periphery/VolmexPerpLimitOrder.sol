// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "../libs/LibOrder.sol";

import "../interfaces/IVirtualToken.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IAccountBalance.sol";
import "../interfaces/IVolmexPerpLimitOrder.sol";

import "../helpers/RoleManager.sol";
import "../helpers/OwnerPausable.sol";

contract VolmexPerpLimitOrder is IVolmexPerpLimitOrder, RoleManager {
    IMarkPriceOracle public markPriceOracle;
    IPositioning public positioning;
    IAccountBalance public accountBalance;

    function initialize(
        IMarkPriceOracle _markPriceOracle,
        IPositioning _positioning,
        IAccountBalance _accountBalance,
        address _admin
    ) external initializer {
        require(_admin != address(0), "Admin can't be address(0)");
        markPriceOracle = _markPriceOracle;
        positioning = _positioning;
        accountBalance = _accountBalance;
        _grantRole(LIMIT_ORDER_ADMIN, _admin);
    }

    function setMarkPriceOracle(IMarkPriceOracle _markPriceOracle) external {
        _requireLimitOrderAdmin();
        markPriceOracle = _markPriceOracle;
    }

    function _fillLimitOrder(
        LimitOrder memory _limitOrder,
        bytes memory _signatureLimitOrder,
        LibOrder.Order memory _order,
        bytes memory _signatureOrder,
        uint256 _triggerPrice
    ) internal {
        _verifyTriggerPrice(_limitOrder, _triggerPrice);

        positioning.openPosition(
            LibOrder.Order({
                trader: _limitOrder.trader,
                deadline: _limitOrder.deadline,
                isShort: _limitOrder.isShort,
                makeAsset: _limitOrder.makeAsset,
                takeAsset: _limitOrder.takeAsset,
                salt: _limitOrder.salt
            }),
            _signatureLimitOrder,
            _order,
            _signatureOrder
        );
    }

    // TODO: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LimitOrder memory _limitOrder, uint256 _triggerPrice) internal view {
        if (_limitOrder.orderType == OrderType.LimitOrder) {
            return;
        }
        // TODO: Add check for round id, when Volmex Oracle updates functionality
        require(_limitOrder.triggerPrice > 0 && _triggerPrice > 0, "Invalid price");
        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder, 15 minutes); // TODO Ask and update this hardhcoded time reference for tw interval

        if (_limitOrder.orderType == OrderType.StopLossLimitOrder) {
            if (_limitOrder.isShort) {
                require(triggeredPrice <= _limitOrder.triggerPrice, "Sell Stop Limit Order Trigger Price Not Matched");
            } else {
                require(triggeredPrice >= _limitOrder.triggerPrice, "Buy Stop Limit Order Trigger Price Not Matched");
            }
        } else if (_limitOrder.orderType == OrderType.TakeProfitLimitOrder) {
            if (_limitOrder.isShort) {
                require(
                    triggeredPrice >= _limitOrder.triggerPrice,
                    "Sell Take-profit Limit Order Trigger Price Not Matched"
                );
            } else {
                require(
                    triggeredPrice <= _limitOrder.triggerPrice,
                    "Buy Take-profit Limit Order Trigger Price Not Matched"
                );
            }
        }
    }

    // TODO: Add round id in the Volmex oracle to faciliate the chainlink oracle functionality
    function _getBaseTokenPrice(LimitOrder memory _order, uint256 _twInterval) internal view returns (uint256 price) {
        // TODO: Add Order validate, similar to -> LibOrder.validate(order);

        address makeAsset = _order.makeAsset.virtualToken;
        address takeAsset = _order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        uint64 _index = markPriceOracle.indexByBaseToken(baseToken);
        return markPriceOracle.getCumulativePrice(_twInterval, _index);
    }

    function _requireLimitOrderAdmin() internal view {
        require(hasRole(LIMIT_ORDER_ADMIN, _msgSender()), "Not Limit Order admin");
    }
}
