// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IVolmexBaseToken } from "../interfaces/IVolmexBaseToken.sol";
import { VirtualToken } from "./VirtualToken.sol";
import { BaseTokenStorageV1 } from "../storage/BaseTokenStorage.sol";

contract VolmexBaseToken is IVolmexBaseToken, VirtualToken, BaseTokenStorageV1 {
    function initialize(
        string memory nameArg,
        string memory symbolArg,
        address priceFeedArg,
        bool isBase
    ) external override initializer {
        __VirtualToken_init(nameArg, symbolArg, isBase);
        _priceFeed = priceFeedArg;
    }

    /// @dev This function is only used for emergency shutdown, to set priceFeed to an emergencyPriceFeed
    function setPriceFeed(address priceFeedArg) external virtual {
        _requireVirtualTokenAdmin();
        _priceFeed = priceFeedArg;
        emit PriceFeedChanged(_priceFeed);
    }

    /// @dev Get price of underlying asset with sma interval
    function getIndexPrice(uint256 index, uint256 _twInterval) external view returns (uint256 answer) {
        (answer) = IPerpetualOracle(_priceFeed).lastestLastPriceSMA(_twInterval, index);
    }

    /// @inheritdoc IVolmexBaseToken
    function getPriceFeed() external view override returns (address) {
        return _priceFeed;
    }
}
