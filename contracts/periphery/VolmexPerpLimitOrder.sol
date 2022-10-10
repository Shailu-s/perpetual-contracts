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

    function fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder
    ) external {
        _fillLimitOrder(
            _leftLimitOrder, 
            _signatureLeftLimitOrder, 
            _rightLimitOrder, 
            _signatureRightLimitOrder
        );
    }

    function _fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder
    ) internal {
        _verifyTriggerPrice(_leftLimitOrder);
        _verifyTriggerPrice(_rightLimitOrder);

        positioning.openPosition(
            _leftLimitOrder, 
            _signatureLeftLimitOrder, 
            _rightLimitOrder,
            _signatureRightLimitOrder
        );
    }

    // TODO: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LibOrder.Order memory _limitOrder) internal view {
        if (_limitOrder.orderType == LibOrder.ORDER) {
            return;
        }
        // TODO: Add check for round id, when Volmex Oracle updates functionality
        // TODO Ask and update this hardhcoded time reference for tw interval
        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder, 15 minutes); 

        if (_limitOrder.orderType == LibOrder.STOP_LOSS_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                require(triggeredPrice <= _limitOrder.triggerPrice, "Sell Stop Limit Order Trigger Price Not Matched");
            } else {
                require(triggeredPrice >= _limitOrder.triggerPrice, "Buy Stop Limit Order Trigger Price Not Matched");
            }
        } else if (_limitOrder.orderType == LibOrder.TAKE_PROFIT_LIMIT_ORDER) {
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
    function _getBaseTokenPrice(LibOrder.Order memory _order, uint256 _twInterval) internal view returns (uint256 price) {
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
