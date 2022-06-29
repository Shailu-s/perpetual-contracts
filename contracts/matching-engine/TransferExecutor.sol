// SPDX-License-Identifier: MIT

pragma solidity 0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IERC20TransferProxy.sol";
import "../interfaces/ITransferExecutor.sol";
import "../interfaces/IMintBurn.sol";

abstract contract TransferExecutor is Initializable, OwnableUpgradeable, ITransferExecutor {
    address internal _proxy;

    event ProxyChange(address proxy);

    function __TransferExecutor_init_unchained(address erc20TransferProxy) internal {
        _proxy = erc20TransferProxy;

        __Ownable_init();
    }

    function setTransferProxy(address proxy) external onlyOwner {
        _proxy = proxy;
        emit ProxyChange(proxy);
    }

    function transferToken(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) internal {
        address token = asset.virtualToken;
        if (from == address(this)) {
            IERC20Upgradeable(token).transfer(to, asset.value);
        } else {
            IERC20TransferProxy(proxy).erc20safeTransferFrom(IERC20Upgradeable(token), from, to, asset.value);
        }
    }

    function transfer(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) internal override {
        address token = asset.virtualToken;
        if (from == address(this)) {
            IERC20Upgradeable(token).transfer(to, asset.value);
        } else {
            IERC20TransferProxy(proxy).erc20safeTransferFrom(IERC20Upgradeable(token), from, to, asset.value);
        }
    }

    uint256[49] private __gap;
}
