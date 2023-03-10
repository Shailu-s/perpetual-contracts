// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../libs/LibAsset.sol";

abstract contract TransferExecutor is AccessControlUpgradeable {
    bytes32 public constant TRANSFER_EXECUTOR = keccak256("TRANSFER_EXECUTOR");
    address internal _proxy;

    event ProxyChanged(address proxy);

    function setTransferProxy(address proxy) external {
        require(hasRole(TRANSFER_EXECUTOR, _msgSender()), "TransferExecutor: Not admin");
        _proxy = proxy;
        emit ProxyChanged(proxy);
    }

    function __TransferExecutor_init_unchained(address _erc20TransferProxy, address _owner) internal {
        _proxy = _erc20TransferProxy;
        _grantRole(TRANSFER_EXECUTOR, _owner);
    }

    function _transfer(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) internal {
        // Transfer of virtual tokens are handled at Positioning.sol
    }

    uint256[50] private __gap;
}
