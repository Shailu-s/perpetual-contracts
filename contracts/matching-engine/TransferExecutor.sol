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
        address baseToken,
        uint256 amount,
        address from,
        address to
    ) internal override {
        IVirtualToken token = IVirtualToken(baseToken);
        if (token.balanceOf(from) == 0) {
            token.mint(to, amount);
        } else if (token.balanceOf(from) >= amount) {
            token.transferFrom(from, to, amount);
        } else {
            uint256 senderBalance = token.balanceOf(from);
            uint256 restToMint = amount - senderBalance;
            token.transferFrom(from, to, senderBalance);
            token.mint(to, restToMint);
        }
    }

    uint256[50] private __gap;
}
