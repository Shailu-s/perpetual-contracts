// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../libs/LibOrder.sol";

interface IVolmexPerpPeriphery {
    event RelayerUpdated(address indexed newRelayerAddress);
    event VaultWhitelisted(address indexed vault, bool isWhitelist);
    event TraderWhitelisted(address indexed account, bool isWhitelist);

    function depositToVault(uint64 _index, address _token, uint256 _amount) external payable;
    function withdrawFromVault(uint64 _index, address _token, address payable _to, uint256 _amount) external;
    function openPosition(uint64 _index, LibOrder.Order memory _orderLeft, bytes memory _signatureLeft, LibOrder.Order memory _orderRight, bytes memory _signatureRight, bytes memory liquidator) external;
    function transferToVault(IERC20Upgradeable _token, address _from, uint256 _amount) external;
     function whitelistTrader(address _trader, bool _isWhitelist) external;
}
