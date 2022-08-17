// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "contracts/matching-engine/TransferManager.sol";
import "contracts/matching-engine/TransferExecutor.sol";
import "contracts/matching-engine/OrderValidator.sol";
import "contracts/libs/LibFill.sol";
import "contracts/libs/LibOrder.sol";
import "contracts/libs/LibAsset.sol";

contract TransferManagerTest is TransferManager, TransferExecutor, OrderValidator {
    function checkDoTransfers(LibDeal.DealSide memory left, LibDeal.DealSide memory right) external payable {
        _doTransfers(left, right);
    }

    function __TransferManager_init() external initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferManager_init_unchained();
        __OrderValidator_init_unchained();
    }
}
