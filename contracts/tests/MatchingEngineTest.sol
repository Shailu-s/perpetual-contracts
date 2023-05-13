// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "../matching-engine/MatchingEngine.sol";

contract MatchingEngineTest is MatchingEngine {
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    function __MatchingEngineTest_init(address owner, IPerpetualOracle perpetualOracle) external initializer {
        initialize(owner, perpetualOracle);
        _grantRole(CAN_MATCH_ORDERS, _msgSender());
        _grantRole(CAN_MATCH_ORDERS, address(this));
    }

    function matchOrdersTest(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) external payable {
        matchOrders(orderLeft, orderRight);
    }

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }

    function addObservation(uint256 _priceCumulative, uint256 _index) public {
        perpetualOracle.addMarkObservation(_priceCumulative, _index);
    }

    //TODO Should be inculded in matching engine core
    function pause() external {
        _requireCanMatchOrders();
        _pause();
    }
}
