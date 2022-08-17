// SPDX-License-Identifier: BUSL - 1.1

pragma solidity ^0.8.12;
pragma abicoder v2;

import "../matching-engine/MatchingEngine.sol";

contract MatchingEngineTest is MatchingEngine
{
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    function __MatchingEngineTest_init(
        address erc20TransferProxy,
        uint256 newProtocolFee,
        address newDefaultFeeReceiver,
        address owner
    ) external initializer {
        initialize(
            erc20TransferProxy,
            newProtocolFee,
            newDefaultFeeReceiver,
            owner
        );
        __Ownable_init_unchained();
    }

    function matchOrdersTest(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight
    ) external payable {
        matchOrders(orderLeft, orderRight);
    }

    function getProtocolFeeTest() public view virtual returns (uint256) {
        return _getProtocolFee();
    }

    function doTransfersTest(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right,
        LibDeal.DealData memory dealData
    ) public virtual returns (uint totalMakeValue, uint totalTakeValue) {
        return _doTransfers(left, right, dealData);
    }

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }
}
