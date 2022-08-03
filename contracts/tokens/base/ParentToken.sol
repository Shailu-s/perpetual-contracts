// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { IPriceFeed } from "@perp/perp-oracle-contract/contracts/interface/IPriceFeed.sol";
import { IIndexPrice } from "../../interfaces/IIndexPrice.sol";
import { VirtualToken } from "../VirtualToken.sol";
import { BaseTokenStorageV1 } from "../../storage/BaseTokenStorage.sol";
import { IVolmexBaseToken } from "../../interfaces/IVolmexBaseToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
abstract contract ParentToken is IVolmexBaseToken, IIndexPrice, VirtualToken, BaseTokenStorageV1 {
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    //
    // EXTERNAL NON-VIEW
    //

    function initialize(
        string memory nameArg,
        string memory symbolArg,
        address priceFeedArg
    ) external override initializer {
        __VirtualToken_init(nameArg, symbolArg);
        _priceFeed = priceFeedArg;
    }

    /// @dev This function is only used for emergency shutdown, to set priceFeed to an emergencyPriceFeed
    function setPriceFeed(address priceFeedArg) external override {

        _priceFeed = priceFeedArg;
        emit PriceFeedChanged(_priceFeed);
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IIndexPrice
    function getIndexPrice(uint256 interval) external view virtual override(IIndexPrice, IVolmexBaseToken) returns (uint256);
    
    /// @inheritdoc IVolmexBaseToken
    function getPriceFeed() external view override returns (address) {
        return _priceFeed;
    }
}
