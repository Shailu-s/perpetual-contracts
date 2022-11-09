// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../interfaces/IERC20TransferProxy.sol";
import "../interfaces/ITransferExecutor.sol";
import "../interfaces/IMintBurn.sol";
import "../interfaces/IVirtualToken.sol";
import "../libs/LibAsset.sol";
import "../helpers/RoleManager.sol";

abstract contract TransferExecutor is RoleManager {
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
