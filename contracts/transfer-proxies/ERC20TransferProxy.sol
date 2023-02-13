// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "../interfaces/IERC20TransferProxy.sol";

contract ERC20TransferProxy is IERC20TransferProxy, Initializable, AccessControlUpgradeable {
    bytes32 public constant TRANSFER_PROXY_ADMIN = keccak256("TRANSFER_PROXY_ADMIN");
    bytes32 public constant TRANSFER_PROXY_CALLER = keccak256("TRANSFER_PROXY_CALLER");

    function erc20TransferProxyInit() external initializer {
        _grantRole(TRANSFER_PROXY_ADMIN, _msgSender());
    }

    function addTransferProxyRole(address exchange) external {
        _requireTransferProxyAdmin();
        _grantRole(TRANSFER_PROXY_CALLER, exchange);
    }

    function erc20SafeTransferFrom(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 value
    ) external override {
        _requireTransferProxyCaller();
        require(token.transferFrom(from, to, value), "ERC20TransferProxy: failure while transferring");
    }

    function _requireTransferProxyAdmin() internal view {
        require(hasRole(TRANSFER_PROXY_ADMIN, _msgSender()), "Positioning: Not admin");
    }

    function _requireTransferProxyCaller() internal view {
        require(hasRole(TRANSFER_PROXY_CALLER, _msgSender()), "Positioning: Not admin");
    }
}
