// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IERC20TransferProxy.sol";
import "../interfaces/ITransferExecutor.sol";
import "../interfaces/IMintBurn.sol";
import "../interfaces/IVirtualToken.sol";

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
        address to
    ) internal override {
        IVirtualToken token = IVirtualToken(asset.virtualToken);
        if (token.balanceOf(from) == 0) {
            token.mint(to, asset.value);
        } else if (token.balanceOf(from) >= asset.value) {
            token.transferFrom(from, to, asset.value);
        } else {
            uint256 senderBalance = token.balanceOf(from);
            uint256 restToMint = asset.value - senderBalance;
            token.transferFrom(from, to, senderBalance);
            token.mint(to, restToMint);
        }
    }

    uint256[49] private __gap;
}
