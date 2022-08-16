// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "contracts/matching-engine/TransferManager.sol";
import "contracts/matching-engine/TransferExecutor.sol";
import "contracts/libs/LibFill.sol";
import "contracts/libs/LibOrder.sol";
import "contracts/libs/LibAsset.sol";

contract TransferManagerTest is
    TransferManager,
    TransferExecutor
{
    function checkDoTransfers(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right,
        LibDeal.DealData memory dealData
    ) external payable {
        _doTransfers(
            left,
            right,
            dealData
        );
    }

    function __TransferManager_init(
        uint256 newProtocolFee,
        address newCommunityWallet
    ) external initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferManager_init_unchained(
            newProtocolFee,
            newCommunityWallet
        );
    }

    function getFeeReceiverTest() external view returns (address) {
        return _getFeeReceiver();
    }
}
