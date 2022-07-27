// SPDX-License-Identifier: MIT

pragma solidity =0.8.12;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../libs/BpLibrary.sol";
import "../interfaces/ITransferManager.sol";

abstract contract TransferManager is OwnableUpgradeable, ITransferManager {
    using BpLibrary for uint256;
    using SafeMathUpgradeable for uint256;

    uint256 public protocolFee;

    address public defaultFeeReceiver;
    mapping(address => address) public feeReceivers;

    /// @dev event that's emitted when protocolFee changes
    event ProtocolFeeChanged(uint256 oldValue, uint256 newValue);

    function __TransferManager_init_unchained(uint256 newProtocolFee, address newDefaultFeeReceiver)
        internal
        initializer
    {
        protocolFee = newProtocolFee;
        defaultFeeReceiver = newDefaultFeeReceiver;
    }

    function setProtocolFee(uint64 _protocolFee) external onlyOwner {
        emit ProtocolFeeChanged(protocolFee, _protocolFee);
        protocolFee = _protocolFee;
    }

    function setDefaultFeeReceiver(address payable newDefaultFeeReceiver) external onlyOwner {
        defaultFeeReceiver = newDefaultFeeReceiver;
    }

    function setFeeReceiver(address token, address wallet) external onlyOwner {
        feeReceivers[token] = wallet;
    }

    function getFeeReceiver(address token) internal view returns (address) {
        address wallet = feeReceivers[token];
        if (wallet != address(0)) {
            return wallet;
        }
        return defaultFeeReceiver;
    }

    function getProtocolFee() internal override virtual view returns (uint256) {
        return protocolFee;
    }

    /**
        @notice executes transfers for 2 matched orders
        @param left DealSide from the left order (see LibDeal.sol)
        @param right DealSide from the right order (see LibDeal.sol)
        @param dealData DealData of the match (see LibDeal.sol)
        @return totalLeftValue - total amount for the left order
        @return totalRightValue - total amout for the right order
    */
    function doTransfers(
        LibDeal.DealSide memory left,
        LibDeal.DealSide memory right,
        LibDeal.DealData memory dealData
    ) internal virtual override returns (uint256 totalLeftValue, uint256 totalRightValue) {
        totalLeftValue = left.amount;
        totalRightValue = right.amount;

        totalLeftValue = doTransfersWithFees(left, right, dealData.protocolFee, dealData.maxFeesBasePoint);
        totalRightValue = doTransfersWithFees(right, left, dealData.protocolFee, dealData.maxFeesBasePoint);
    }

    /**
        @notice executes the fee-side transfers (payment + fees)
        @param calculateSide DealSide of the fee-side order
        @param _protocolFee protocol fee for the match (always 0 for V2 and earlier orders)
        @param maxFeesBasePoint max fee for the sell-order (used and is > 0 for V3 orders only)
        @return totalAmount of fee-side asset
    */
    function doTransfersWithFees(
        LibDeal.DealSide memory calculateSide,
        LibDeal.DealSide memory anotherSide,
        uint256 _protocolFee,
        uint256 maxFeesBasePoint
    ) internal returns (uint256 totalAmount) {
        totalAmount = calculateTotalAmount(calculateSide.amount, _protocolFee, maxFeesBasePoint);
        uint256 rest = transferProtocolFee(
            totalAmount,
            calculateSide.amount,
            calculateSide.from,
            _protocolFee,
            calculateSide.baseToken
        );
        transfer(
            calculateSide.baseToken,
            rest,
            calculateSide.from,
            anotherSide.from
        );
    }

    function transferProtocolFee(
        uint256 totalAmount,
        uint256 amount,
        address from,
        uint256 _protocolFee,
        address matchCalculateToken
    ) internal returns (uint256) {
        (uint256 rest, uint256 fee) = subFeeInBp(totalAmount, amount, _protocolFee);
        if (fee > 0) {
            transfer(matchCalculateToken, fee, from, getFeeReceiver(matchCalculateToken));
        }
        return rest;
    }

    /**
        @notice calculates total amount of fee-side asset that is going to be used in match
        @param amount fee-side order value
        @param feeOnTopBp protocolFee (it adds on top of the amount for the orders of )
        @param maxFeesBasePoint max fee for the sell-order (used and is > 0 for V3 orders only)
        @return total amount of fee-side asset
    */
    function calculateTotalAmount(
        uint256 amount,
        uint256 feeOnTopBp,
        uint256 maxFeesBasePoint
    ) internal pure returns (uint256) {
        if (maxFeesBasePoint > 0) {
            return amount;
        }
        uint256 total = amount.add(amount.bp(feeOnTopBp));
        return total;
    }

    function subFeeInBp(
        uint256 value,
        uint256 total,
        uint256 feeInBp
    ) internal pure returns (uint256 newValue, uint256 realFee) {
        return subFee(value, total.bp(feeInBp));
    }

    function subFee(uint256 value, uint256 fee) internal pure returns (uint256 newValue, uint256 realFee) {
        if (value > fee) {
            newValue = value.sub(fee);
            realFee = fee;
        } else {
            newValue = 0;
            realFee = value;
        }
    }

    uint256[50] private __gap;
}
