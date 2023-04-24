// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.18;
pragma abicoder v2;

import { LibOrder } from "../libs/LibOrder.sol";
import "../libs/LibAsset.sol";
import "../interfaces/IVirtualToken.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IPositioning.sol";

contract AccountBalanceMock {
    int256 public fakeOwedRealisedPnlX10_18;
    int256 public fakeUnrealizedPnlX10_18;
    uint256 public fakePendingFeeX10_18;
    address public _positioningConfig;

    function initialize(address positioningConfigArg) external {
        _positioningConfig = positioningConfigArg;
    }

    function mock_setOwedRealisedPnlX10_18(int256 value) public {
        fakeOwedRealisedPnlX10_18 = value;
    }

    function mock_setUnrealizedPnlX10_18(int256 value) public {
        fakeUnrealizedPnlX10_18 = value;
    }

    function mock_setPendingFeeX10_18(uint256 value) public {
        fakePendingFeeX10_18 = value;
    }

    function registerBaseToken(address trader, address baseToken) external {
        IPositioning positioning = IPositioning(msg.sender);
        LibOrder.Order memory orderLeft =
            LibOrder.Order({
                orderType: 0xf555eb98,
                deadline: 16583738838,
                trader: address(msg.sender),
                makeAsset: LibAsset.Asset({ virtualToken: msg.sender, value: 90 }),
                takeAsset: LibAsset.Asset({ virtualToken: msg.sender, value: 80 }),
                salt: 9,
                limitOrderTriggerPrice: 800000,
                isShort: true
            });
        LibOrder.Order memory orderRight =
            LibOrder.Order({
                orderType: 0xf555eb98,
                deadline: 16583738838,
                trader: address(msg.sender),
                makeAsset: LibAsset.Asset({ virtualToken: msg.sender, value: 90 }),
                takeAsset: LibAsset.Asset({ virtualToken: msg.sender, value: 80 }),
                salt: 9,
                limitOrderTriggerPrice: 800000,
                isShort: false
            });
        bytes memory signatureLeft = "0x000000000000000000";
        bytes memory signatureRight = "0x000000000000000000";
        bytes memory liquidator = "0x000000000000000000000000000000000000";
        positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator);
    }
}
