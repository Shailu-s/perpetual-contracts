// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "../lib/LibFill.sol";
import "../lib/LibOrderData.sol";
import "./OrderValidator.sol";
import "./AssetMatcher.sol";

import "./TransferExecutor.sol";
import "../interface/ITransferManager.sol";
import "../lib/ExchangeFee.sol";

abstract contract ExchangeModule is
    Initializable,
    OwnableUpgradeable,
    AssetMatcher,
    TransferExecutor,
    OrderValidator,
    ITransferManager
{
    using SafeMathUpgradeable for uint256;

    uint256 private constant UINT256_MAX = 2**256 - 1;

    //state of the orders
    mapping(bytes32 => uint256) public fills;

    //events
    event Cancel(bytes32 hash);
    event Match(uint256 newLeftFill, uint256 newRightFill);

    function cancel(LibOrder.Order memory order) external {
        require(_msgSender() == order.maker, "not a maker");
        require(order.salt != 0, "0 salt can't be used");
        bytes32 orderKeyHash = LibOrder.hashKey(order);
        fills[orderKeyHash] = UINT256_MAX;
        emit Cancel(orderKeyHash);
    }

    function matchOrders(
        LibOrder.Order memory orderLeft,
        bytes memory signatureLeft,
        LibOrder.Order memory orderRight,
        bytes memory signatureRight
    ) external payable {
        validateFull(orderLeft, signatureLeft);
        validateFull(orderRight, signatureRight);
        if (orderLeft.taker != address(0)) {
            require(orderRight.maker == orderLeft.taker, "leftOrder.taker verification failed");
        }
        if (orderRight.taker != address(0)) {
            require(orderRight.taker == orderLeft.maker, "rightOrder.taker verification failed");
        }
        matchAndTransfer(orderLeft, orderRight);
    }

    /**
        @notice matches valid orders and transfers their assets
        @param orderLeft the left order of the match
        @param orderRight the right order of the match
    */
    function matchAndTransfer(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight) internal {
        (LibAsset.AssetType memory makeMatch, LibAsset.AssetType memory takeMatch) = matchAssets(orderLeft, orderRight);

        LibOrderData.GenericOrderData memory leftOrderData = LibOrderData.parse(orderLeft);
        LibOrderData.GenericOrderData memory rightOrderData = LibOrderData.parse(orderRight);

        LibFill.FillResult memory newFill =
            getFillSetNew(orderLeft, orderRight, leftOrderData.isMakeFill, rightOrderData.isMakeFill);

        (uint256 totalMakeValue, uint256 totalTakeValue) =
            doTransfers(
                LibDeal.DealSide(
                    LibAsset.Asset(makeMatch, newFill.leftValue),
                    leftOrderData.payouts,
                    leftOrderData.originFees,
                    proxies[makeMatch.assetClass],
                    orderLeft.maker
                ),
                LibDeal.DealSide(
                    LibAsset.Asset(takeMatch, newFill.rightValue),
                    rightOrderData.payouts,
                    rightOrderData.originFees,
                    proxies[takeMatch.assetClass],
                    orderRight.maker
                ),
                getDealData(
                    makeMatch.assetClass,
                    takeMatch.assetClass,
                    orderLeft.dataType,
                    orderRight.dataType,
                    leftOrderData,
                    rightOrderData
                )
            );

        emit Match(newFill.rightValue, newFill.leftValue);
    }

    /**
        @notice determines the max amount of fees for the match
        @param dataTypeLeft data type of the left order
        @param dataTypeRight data type of the right order
        @param leftOrderData data of the left order
        @param rightOrderData data of the right order
        @param feeSide fee side of the match
        @param _protocolFee protocol fee of the match
        @return max fee amount in base points
    */
    function getMaxFee(
        bytes4 dataTypeLeft,
        bytes4 dataTypeRight,
        LibOrderData.GenericOrderData memory leftOrderData,
        LibOrderData.GenericOrderData memory rightOrderData,
        LibFeeSide.FeeSide feeSide,
        uint256 _protocolFee
    ) internal pure returns (uint256) {
        if (
            dataTypeLeft != LibOrderDataV3.V3_SELL &&
            dataTypeRight != LibOrderDataV3.V3_SELL &&
            dataTypeLeft != LibOrderDataV3.V3_BUY &&
            dataTypeRight != LibOrderDataV3.V3_BUY
        ) {
            return 0;
        }

        uint256 matchFees = getSumFees(_protocolFee, leftOrderData.originFees, rightOrderData.originFees);
        uint256 maxFee;
        if (feeSide == LibFeeSide.FeeSide.LEFT) {
            maxFee = rightOrderData.maxFeesBasePoint;
            require(dataTypeLeft == LibOrderDataV3.V3_BUY && dataTypeRight == LibOrderDataV3.V3_SELL, "wrong V3 type1");
        } else if (feeSide == LibFeeSide.FeeSide.RIGHT) {
            maxFee = leftOrderData.maxFeesBasePoint;
            require(dataTypeRight == LibOrderDataV3.V3_BUY && dataTypeLeft == LibOrderDataV3.V3_SELL, "wrong V3 type2");
        } else {
            return 0;
        }
        require(maxFee > 0 && maxFee >= matchFees && maxFee <= 1000, "wrong maxFee");

        return maxFee;
    }

    function getDealData(
        bytes4 makeMatchAssetClass,
        bytes4 takeMatchAssetClass,
        bytes4 leftDataType,
        bytes4 rightDataType,
        LibOrderData.GenericOrderData memory leftOrderData,
        LibOrderData.GenericOrderData memory rightOrderData
    ) internal view returns (LibDeal.DealData memory dealData) {
        dealData.protocolFee = getProtocolFeeConditional(leftDataType);
        dealData.feeSide = LibFeeSide.getFeeSide(makeMatchAssetClass, takeMatchAssetClass);
        dealData.maxFeesBasePoint = getMaxFee(
            leftDataType,
            rightDataType,
            leftOrderData,
            rightOrderData,
            dealData.feeSide,
            dealData.protocolFee
        );
    }

    /**
        @notice calculates amount of fees for the match
        @param _protocolFee protocolFee of the match
        @param originLeft origin fees of the left order
        @param originRight origin fees of the right order
        @return sum of all fees for the match (protcolFee + leftOrder.originFees + rightOrder.originFees)
     */
    function getSumFees(
        uint256 _protocolFee,
        LibPart.Part[] memory originLeft,
        LibPart.Part[] memory originRight
    ) internal pure returns (uint256) {
        //start from protocol fee
        uint256 result = _protocolFee;

        //adding left origin fees
        for (uint256 i; i < originLeft.length; i++) {
            result = result + originLeft[i].value;
        }

        //adding right protocol fees
        for (uint256 i; i < originRight.length; i++) {
            result = result + originRight[i].value;
        }

        return result;
    }

    /**
        @notice calculates fills for the matched orders and set them in "fills" mapping
        @param orderLeft left order of the match
        @param orderRight right order of the match
        @param leftMakeFill true if the left orders uses make-side fills, false otherwise
        @param rightMakeFill true if the right orders uses make-side fills, false otherwise
        @return returns change in orders' fills by the match 
    */
    function getFillSetNew(
        LibOrder.Order memory orderLeft,
        LibOrder.Order memory orderRight,
        bool leftMakeFill,
        bool rightMakeFill
    ) internal returns (LibFill.FillResult memory) {
        bytes32 leftOrderKeyHash = LibOrder.hashKey(orderLeft);
        bytes32 rightOrderKeyHash = LibOrder.hashKey(orderRight);
        uint256 leftOrderFill = getOrderFill(orderLeft.salt, leftOrderKeyHash);
        uint256 rightOrderFill = getOrderFill(orderRight.salt, rightOrderKeyHash);
        LibFill.FillResult memory newFill =
            LibFill.fillOrder(orderLeft, orderRight, leftOrderFill, rightOrderFill, leftMakeFill, rightMakeFill);

        require(newFill.rightValue > 0 && newFill.leftValue > 0, "nothing to fill");

        if (orderLeft.salt != 0) {
            if (leftMakeFill) {
                fills[leftOrderKeyHash] = leftOrderFill.add(newFill.leftValue);
            } else {
                fills[leftOrderKeyHash] = leftOrderFill.add(newFill.rightValue);
            }
        }

        if (orderRight.salt != 0) {
            if (rightMakeFill) {
                fills[rightOrderKeyHash] = rightOrderFill.add(newFill.rightValue);
            } else {
                fills[rightOrderKeyHash] = rightOrderFill.add(newFill.leftValue);
            }
        }
        return newFill;
    }

    function getOrderFill(uint256 salt, bytes32 hash) internal view returns (uint256 fill) {
        if (salt == 0) {
            fill = 0;
        } else {
            fill = fills[hash];
        }
    }

    function matchAssets(LibOrder.Order memory orderLeft, LibOrder.Order memory orderRight)
        internal
        view
        returns (LibAsset.AssetType memory makeMatch, LibAsset.AssetType memory takeMatch)
    {
        makeMatch = matchAssets(orderLeft.makeAsset.assetType, orderRight.takeAsset.assetType);
        require(makeMatch.assetClass != 0, "assets don't match");
        takeMatch = matchAssets(orderLeft.takeAsset.assetType, orderRight.makeAsset.assetType);
        require(takeMatch.assetClass != 0, "assets don't match");
    }

    function validateFull(LibOrder.Order memory order, bytes memory signature) internal view {
        LibOrder.validate(order);
        validate(order, signature);
    }

    function getProtocolFee() internal view virtual returns (uint256);

    /**
        @notice returns protocol Fee for V3 or upper orders, 0 for V2 and earlier ordrs
        @param leftDataType type of the left order in a match
        @return protocol fee
    */
    function getProtocolFeeConditional(bytes4 leftDataType) internal view returns (uint256) {
        if (leftDataType == LibOrderDataV3.V3_SELL || leftDataType == LibOrderDataV3.V3_BUY) {
            return getProtocolFee();
        }
        return 0;
    }

    uint256[47] private __gap;
}
