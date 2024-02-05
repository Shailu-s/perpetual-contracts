// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

import "../libs/LibOrder.sol";

interface IPerpPeriphery {
    event RelayerUpdated(address indexed newRelayerAddress);
    event VaultWhitelisted(address indexed vault, bool isWhitelist);
    event TraderWhitelisted(address indexed account, bool isWhitelist);

    function depositToVault(uint256 _index, address _token, uint256 _amount) external;
    function withdrawFromVault(uint256 _index, address _token, address _to, uint256 _amount) external;
    function openPosition(uint256 _index, LibOrder.Order memory _makerOrder, bytes memory _signatureMaker, LibOrder.Order memory _takerOrder, bytes memory _signatureTaker, bytes memory liquidator) external;
    function transferToVault(IERC20Upgradeable _token, address _from, uint256 _amount) external;
     function whitelistTrader(address _trader, bool _isWhitelist) external;
}
