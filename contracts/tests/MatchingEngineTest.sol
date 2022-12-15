// SPDX-License-Identifier: BUSL - 1.1

pragma solidity ^0.8.12;
pragma abicoder v2;

import "../matching-engine/MatchingEngine.sol";

contract MatchingEngineTest is MatchingEngine
{
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    function __MatchingEngineTest_init(
        address owner,
        IMarkPriceOracle markPriceOracle
    ) external initializer {
        initialize(
            owner,
            markPriceOracle
        );
        __Ownable_init_unchained();
        _grantRole(CAN_CANCEL_ALL_ORDERS, address(this));
        _grantRole(CAN_CANCEL_ALL_ORDERS, _msgSender());
        _grantRole(CAN_MATCH_ORDERS, _msgSender());
        _grantRole(CAN_MATCH_ORDERS, address(this));
        _grantRole(CAN_ADD_OBSERVATION, address(this));
    }

    function matchOrdersTest(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight
    ) external payable {
        matchOrders(orderLeft, orderRight);
    }

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }

    function addAssets(uint256[] memory _priceCumulative, address[] memory _asset) public {
        markPriceOracle.addAssets(_priceCumulative, _asset);
    }

    function addObservation(uint256 _priceCumulative, uint64 _index) public {
        _grantRole(CAN_ADD_OBSERVATION, address(this));
        markPriceOracle.addObservation(_priceCumulative, _index);
    }
    //TODO Should be inculded in matching engine core
    function pause() external {
        _requireCanMatchOrders();
        _pause();
    }

}
