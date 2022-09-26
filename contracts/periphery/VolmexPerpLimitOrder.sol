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
