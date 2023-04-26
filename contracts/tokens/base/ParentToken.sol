// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { IIndexPrice } from "../../interfaces/IIndexPrice.sol";
import { VirtualToken } from "../VirtualToken.sol";
import { BaseTokenStorageV1 } from "../../storage/BaseTokenStorage.sol";
import { IVolmexBaseToken } from "../../interfaces/IVolmexBaseToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
abstract contract ParentToken is IVolmexBaseToken, IIndexPrice, VirtualToken, BaseTokenStorageV1 {
    function initialize(
        string memory nameArg,
        string memory symbolArg,
        address priceFeedArg,
        bool isBase
    ) external override initializer {
        __VirtualToken_init(nameArg, symbolArg, isBase);
        _priceFeed = priceFeedArg;
        _twInterval = 28800;
    }

    /// @dev This function is only used for emergency shutdown, to set priceFeed to an emergencyPriceFeed
    function setPriceFeed(address priceFeedArg) external override {
        _priceFeed = priceFeedArg;
        emit PriceFeedChanged(_priceFeed);
    }

    /// @dev Used to set twap interval from price feed
    function setTwInterval(uint256 _interval) external {
        _twInterval = _interval;
    }

    /// @inheritdoc IIndexPrice
    function getIndexPrice(uint256 index) external view virtual override(IIndexPrice, IVolmexBaseToken) returns (uint256);

    /// @inheritdoc IVolmexBaseToken
    function getPriceFeed() external view override returns (address) {
        return _priceFeed;
    }
}
