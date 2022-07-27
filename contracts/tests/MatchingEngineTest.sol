// SPDX-License-Identifier: MIT

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
        __MatchingEngine_init(
            erc20TransferProxy,
            newProtocolFee,
            newDefaultFeeReceiver,
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

    function getProtocolFeeTest() public view virtual returns (uint256) {
        return getProtocolFee();
    }

    function doTransfersTest(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right,
        LibDeal.DealData memory dealData
    ) public virtual returns (uint totalMakeValue, uint totalTakeValue) {
        return doTransfers(left, right, dealData);
    }

    function setMakerMinSalt(uint256 _val) external {
        makerMinSalt[_msgSender()] = _val;
    }
}
