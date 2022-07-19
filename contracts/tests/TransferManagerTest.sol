// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;
pragma abicoder v2;

import "contracts/matching-engine/TransferManager.sol";
import "contracts/matching-engine/TransferExecutor.sol";
import "contracts/matching-engine/OrderValidator.sol";
import "contracts/libs/LibFill.sol";
import "contracts/libs/LibOrder.sol";
import "contracts/libs/LibAsset.sol";
import "contracts/libs/LibOrderData.sol";
import "contracts/libs/LibOrderDataParse.sol";

contract TransferManagerTest is
    TransferManager,
    TransferExecutor,
    OrderValidator
{
    function checkDoTransfers(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right,
        LibDeal.DealData memory dealData
    ) external payable {
        doTransfers(
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
        __OrderValidator_init_unchained();
    }

    function encode(LibOrderData.Data memory data)
        external
        pure
        returns (bytes memory)
    {
        return abi.encode(data);
    }

    function transferTokenTest(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) external {
        transferToken(
            asset,
            from,
            to,
            proxy
        );
    }

    function getFeeReceiverTest(address token) external view returns (address) {
        return getFeeReceiver(token);
    }
}
