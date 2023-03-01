// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../libs/LibDeal.sol";
import "../matching-engine/TransferExecutor.sol";

abstract contract TransferManager is OwnableUpgradeable, TransferExecutor {
    uint256 private constant _BASE = 10000;

    /// @dev event that's emitted when protocolFee changes
    event ProtocolFeeChanged(uint256 oldValue, uint256 newValue);

    function __TransferManager_init_unchained(address _erc20Proxy, address _owner) internal initializer {
        __TransferExecutor_init_unchained(_erc20Proxy, _owner);
    }

    /**
        @notice executes transfers for 2 matched orders
        @param left DealSide from the left order (see LibDeal.sol)
        @param right DealSide from the right order (see LibDeal.sol)
        @return totalLeftValue - total amount for the left order
        @return totalRightValue - total amout for the right order
    */
    function _doTransfers(LibDeal.DealSide memory left, LibDeal.DealSide memory right) internal virtual returns (uint256 totalLeftValue, uint256 totalRightValue) {
        totalLeftValue = left.asset.value;
        totalRightValue = right.asset.value;

        _transferPayouts(left.asset.virtualToken, totalLeftValue, left.from, right.from, left.proxy);
        _transferPayouts(right.asset.virtualToken, totalRightValue, right.from, left.from, right.proxy);
    }

    function _transferPayouts(
        address matchCalculate,
        uint256 amount,
        address from,
        address to,
        address proxy
    ) internal {
        if (amount > 0) {
            _transfer(LibAsset.Asset(matchCalculate, amount), from, to, proxy);
        }
    }

    /**
        @notice calculates total amount of fee-side asset that is going to be used in match
        @param amount fee-side order value
        @param feeOnTopBp protocolFee (it adds on top of the amount for the orders of )
        @param maxFeesBasePoint max fee for the sell-order (used and is > 0 for V3 orders only)
        @return total amount of fee-side asset
    */
    function _calculateTotalAmount(
        uint256 amount,
        uint256 feeOnTopBp,
        uint256 maxFeesBasePoint
    ) internal pure returns (uint256) {
        if (maxFeesBasePoint > 0) {
            return amount;
        }
        uint256 basePointAmount = (amount * feeOnTopBp) / _BASE;
        uint256 total = amount + basePointAmount;
        return total;
    }

    function _subFeeInBp(
        uint256 value,
        uint256 total,
        uint256 feeInBp
    ) internal pure returns (uint256 newValue, uint256 realFee) {
        uint256 basePointAmount = (total * feeInBp) / _BASE;
        return _subFee(value, basePointAmount);
    }

    function _subFee(uint256 value, uint256 fee) internal pure returns (uint256 newValue, uint256 realFee) {
        if (value > fee) {
            newValue = value - fee;
            realFee = fee;
        } else {
            newValue = 0;
            realFee = value;
        }
    }

    uint256[50] private __gap;
}
