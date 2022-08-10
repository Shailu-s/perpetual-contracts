// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { Positioning } from "../orderbook/Positioning.sol";
import "../libs/LibOrder.sol";

contract PositioningTest is Positioning {

    function __PositioningTest_init(
        address positioningConfigArg,
        address vault,
        address accountBalance,
         address matchingEngine,
        address markPriceArg,
        address indexPriceArg,
        uint64 _underlyingPriceIndex
    ) external initializer {
        initialize(
            positioningConfigArg,
            vault,
            accountBalance,
            matchingEngine,
            markPriceArg,
            indexPriceArg,
            _underlyingPriceIndex
        );
        __OwnerPausable_init();
        __FundingRate_init(markPriceArg, indexPriceArg);
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