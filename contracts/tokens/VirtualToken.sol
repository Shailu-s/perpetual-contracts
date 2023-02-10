// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity =0.8.12;

import { ERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

contract VirtualToken is IVirtualToken, ERC20Upgradeable, AccessControlUpgradeable {
    bytes32 public constant VIRTUAL_TOKEN_ADMIN = keccak256("VIRTUAL_TOKEN_ADMIN");
    bytes32 public constant MINTER = keccak256("MINTER");
    bytes32 public constant BURNER = keccak256("BURNER");

    mapping(address => bool) internal _whitelistMap;
    bool public isBase;

    event WhitelistAdded(address account);
    event WhitelistRemoved(address account);

    function __VirtualToken_init(
        string memory nameArg,
        string memory symbolArg,
        bool isBaseArg
    ) internal onlyInitializing {
        isBase = isBaseArg;
        __ERC20_init(nameArg, symbolArg);
        _grantRole(VIRTUAL_TOKEN_ADMIN, _msgSender());
    }

    function setMintBurnRole(address minterBurner) external {
        _requireVirtualTokenAdmin();
        _grantRole(MINTER, minterBurner);
        _grantRole(BURNER, minterBurner);
    }

    function mint(address recipient, uint256 amount) external override {
        _requireMinterRole();
        _mint(recipient, amount);
    }

    function burn(address recipient, uint256 amount) external override {
        _requireBurnerRole();
        _burn(recipient, amount);
    }

    function mintMaximumTo(address recipient) external override {
        _requireVirtualTokenAdmin();
        _mint(recipient, type(uint256).max);
    }

    function addWhitelist(address account) external override {
        _requireVirtualTokenAdmin();
        _whitelistMap[account] = true;
        emit WhitelistAdded(account);
    }

    function removeWhitelist(address account) external override {
        _requireVirtualTokenAdmin();
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

    function _requireVirtualTokenAdmin() internal view {
        require(hasRole(VIRTUAL_TOKEN_ADMIN, _msgSender()), "VirtualToken: Not admin");
    }

    function _requireMinterRole() internal view {
        require(hasRole(MINTER, _msgSender()), "VirtualToken: Not minter");
    }

    function _requireBurnerRole() internal view {
        require(hasRole(BURNER, _msgSender()), "VirtualToken: Not burner");
    }

    uint256[50] private __gap;
}
