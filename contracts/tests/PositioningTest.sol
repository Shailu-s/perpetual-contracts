// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
import { Positioning } from "../orderbook/Positioning.sol";
import "../libs/LibOrder.sol";

contract PositioningTest is Positioning {

    function __PositioningTest_init(
        address positioningConfigArg,
        address vault,
        address exchange,
        address accountBalance,
         address matchingEngine
    ) external initializer {
        initialize(
            positioningConfigArg,
            vault,
            exchange,
            accountBalance,
            matchingEngine
        );
        __OwnerPausable_init();
    }

    function openPositionTest( 
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
        ) external {
            openPosition(orderLeft, signatureLeft, orderRight, signatureRight);
        }
}