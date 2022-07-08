// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import { IPriceFeed } from "@perp/perp-oracle-contract/contracts/interface/IPriceFeed.sol";
import { IIndexPrice } from "../../interfaces/IIndexPrice.sol";
import { VirtualToken } from "../VirtualToken.sol";
import { BaseTokenStorage } from "../../storage/BaseTokenStorage.sol";
import { IVolmexBaseToken } from "../../interfaces/IVolmexBaseToken.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
abstract contract ParentBaseToken is IVolmexBaseToken, IIndexPrice, VirtualToken, BaseTokenStorageV1 {
    using SafeMathUpgradeable for uint256;
    using SafeMathUpgradeable for uint8;

    //
    // EXTERNAL NON-VIEW
    //

    /// @dev This function is only used for emergency shutdown, to set priceFeed to an emergencyPriceFeed
    function setPriceFeed(address priceFeedArg) external onlyOwner;

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IIndexPrice
    function getIndexPrice(uint256 interval) external view override returns (uint256);

    /// @inheritdoc IVolmexBaseToken
    function getPriceFeed() external view override returns (address);

    //
    // INTERNAL VIEW
    //

    function _formatDecimals(uint256 _price) internal view returns (uint256) {
        return _price.mul(10**(decimals().sub(_priceFeedDecimals)));
    }
}
