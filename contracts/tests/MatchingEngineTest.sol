// SPDX-License-Identifier: BUSL - 1.1

pragma solidity ^0.8.12;
pragma abicoder v2;

import "../matching-engine/MatchingEngine.sol";

contract MatchingEngineTest is MatchingEngine
{
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    function __MatchingEngineTest_init(
        address erc20TransferProxy,
        address owner
    ) external initializer {
        initialize(
            erc20TransferProxy,
            owner
        );
        __Ownable_init_unchained();
    }

    function matchOrdersTest(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) external payable {
        matchOrders(orderLeft, signatureLeft, orderRight, signatureRight);
    }

    function doTransfersTest(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right
    ) public virtual returns (uint totalMakeValue, uint totalTakeValue) {
        return _doTransfers(left, right);
    }

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }
}
