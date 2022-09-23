// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../libs/LibOrder.sol";
import "../interfaces/IVirtualToken.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../helpers/RoleManager.sol";
import "../helpers/OwnerPausable.sol";

contract LimitOrder is Initializable, RoleManager {
    IMarkPriceOracle public markPriceOracle;

    function initialize(IMarkPriceOracle _markPriceOracle, address _admin) external initializer {
        require(_admin != address(0), "Admin can't be address(0)");
        markPriceOracle = _markPriceOracle;
        _grantRole(LIMIT_ORDER_ADMIN, _admin);
    }

    function setMarkPriceOracle(IMarkPriceOracle _markPriceOracle) external {
        _requireLimitOrderAdmin();
        markPriceOracle = _markPriceOracle;
    }

    function getBaseTokenPrice(LibOrder.Order memory order, uint256 _twInterval) 
        public 
        view
        returns (uint256 price) 
    {
        LibOrder.validate(order);

        address makeAsset = order.makeAsset.virtualToken;
        address takeAsset = order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        uint64 _index = markPriceOracle.indexByBaseToken(baseToken);
        return markPriceOracle.getCumulativePrice(_twInterval, _index);
    }

    function _requireLimitOrderAdmin() internal view {
        require(hasRole(LIMIT_ORDER_ADMIN, _msgSender()), "Not Limit Order admin");
    }
}
