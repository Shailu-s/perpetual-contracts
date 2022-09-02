// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;
pragma abicoder v2;

import "contracts/matching-engine/TransferManager.sol";
import "contracts/libs/LibFill.sol";
import "contracts/libs/LibOrder.sol";
import "contracts/libs/LibAsset.sol";

contract TransferManagerTest is TransferManager {
    function checkDoTransfers(LibDeal.DealSide memory left, LibDeal.DealSide memory right) external payable {
        _doTransfers(left, right);
    }

    function __TransferManager_init(address _erc20Proxy, address _owner) external initializer {
        __Context_init_unchained();
        __Ownable_init_unchained();
        __TransferManager_init_unchained(_erc20Proxy, _owner);
    }
}
