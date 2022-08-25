// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

contract VirtualToken is IVirtualToken, OwnableUpgradeable, ERC20Upgradeable {
    mapping(address => bool) internal _whitelistMap;
    bool public isBase;

    event WhitelistAdded(address account);
    event WhitelistRemoved(address account);

    function __VirtualToken_init(string memory nameArg, string memory symbolArg, bool isBaseArg) public onlyInitializing {
        isBase = isBaseArg;
        __Ownable_init();
        __ERC20_init(nameArg, symbolArg);
    }

    /**
    TODO: we cannot mint tokens here as _beforeTokenTransfer will fail
     */
    function mint(address recipient, uint256 amount) external override {
        _mint(recipient, amount);
    }

    function burn(address recipient, uint256 amount) external override onlyOwner {
        _burn(recipient, amount);
    }

    function mintMaximumTo(address recipient) external override onlyOwner {
        _mint(recipient, type(uint256).max);
    }

    function addWhitelist(address account) external override onlyOwner {
        _whitelistMap[account] = true;
        emit WhitelistAdded(account);
    }

    function removeWhitelist(address account) external override onlyOwner {
        // VT_BNZ: balance is not zero
        require(balanceOf(account) == 0, "VT_BNZ");
        delete _whitelistMap[account];
        emit WhitelistRemoved(account);
    }

    /// @inheritdoc IVirtualToken
    function isInWhitelist(address account) external view override returns (bool) {
        return _whitelistMap[account];
    }

    /// @inheritdoc ERC20Upgradeable
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal virtual override {
        super._beforeTokenTransfer(from, to, amount);

        // `from` == address(0) when mint()
        if (from != address(0)) {
            // not whitelisted
            require(_whitelistMap[from], "VT_NW");
        }
    }

    uint256[50] private __gap;
}