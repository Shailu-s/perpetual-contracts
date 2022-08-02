// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;
import { Positioning } from "../orderbook/Positioning.sol";

contract PositioningTest is Positioning {

    function __PositioningTest_init(
        address positioningConfigArg,
        address vault,
        address exchange,
        address accountBalance
    ) external initializer {
        initialize(
            positioningConfigArg,
            vault,
            exchange,
            accountBalance
        );
        __OwnerPausable_init();
    }

    function openPositionTest( 
        OrderParams memory orderLeft,
        bytes memory signatureLeft,
        OrderParams memory orderRight,
        bytes memory signatureRight) external {
            openPosition(orderLeft, signatureLeft, orderRight, signatureRight);
        }
}