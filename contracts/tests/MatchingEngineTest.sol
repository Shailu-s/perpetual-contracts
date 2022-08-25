// SPDX-License-Identifier: BUSL - 1.1

pragma solidity ^0.8.12;
pragma abicoder v2;

import "../matching-engine/MatchingEngine.sol";

contract MatchingEngineTest is MatchingEngine
{
    uint256 private constant _UINT256_MAX = 2**256 - 1;

    function __MatchingEngineTest_init(
        address erc20TransferProxy,
        address owner,
        IMarkPriceOracle markPriceOracle
    ) external initializer {
        initialize(
            erc20TransferProxy,
            owner,
            markPriceOracle
        );
        __Ownable_init_unchained();
    }

    function matchOrdersTest(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight
    ) external payable {
        matchOrders(orderLeft, orderRight);
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

    function addAssets(uint256[] memory _priceCumulative, address[] memory _asset) public {
        markPriceOracle.addAssets(_priceCumulative, _asset);
    }

    function addObservation(uint256 _priceCumulative, uint64 _index) public {
        markPriceOracle.addObservation(_priceCumulative, _index);
    }
}
