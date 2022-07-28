// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/IERC20TransferProxy.sol";
import "../interfaces/ITransferExecutor.sol";
import "../interfaces/IMintBurn.sol";
import "../interfaces/IVirtualToken.sol";
import "../libs/LibAsset.sol";

abstract contract TransferExecutor is Initializable, OwnableUpgradeable, ITransferExecutor {
    address internal _proxy;

    event ProxyChanged(address proxy);

    function __TransferExecutor_init_unchained(address erc20TransferProxy) internal {
        _proxy = erc20TransferProxy;

        __Ownable_init();
    }

    function setTransferProxy(address proxy) external onlyOwner {
        _proxy = proxy;
        emit ProxyChanged(proxy);
    }

    function _transfer(
        LibAsset.Asset memory asset,
        address from,
        address to,
        address proxy
    ) internal override {
        IVirtualToken token = IVirtualToken(asset.virtualToken);
        if (token.balanceOf(from) == 0) {
            token.mint(to, asset.value);
        } else if (token.balanceOf(from) >= asset.value) {
            IERC20TransferProxy(proxy).erc20SafeTransferFrom(IERC20Upgradeable(token), from, to, asset.value);
        } else {
            uint256 senderBalance = token.balanceOf(from);
            uint256 restToMint = asset.value - senderBalance;
            IERC20TransferProxy(proxy).erc20SafeTransferFrom(IERC20Upgradeable(token), from, to, senderBalance);
            token.mint(to, restToMint);
        }
    }

    uint256[50] private __gap;
}
