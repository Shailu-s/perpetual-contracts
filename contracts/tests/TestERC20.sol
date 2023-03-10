// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/presets/ERC20PresetMinterPauserUpgradeable.sol";

contract TestERC20 is ERC20PresetMinterPauserUpgradeable {
    uint256 _transferFeeRatio;
    uint8 _decimal;

    function __TestERC20_init(
        string memory name,
        string memory symbol,
        uint8 decimal
    ) public initializer {
        __ERC20PresetMinterPauser_init(name, symbol);
        _mint(_msgSender(), 10000000000000000000000000000);
        _transferFeeRatio = 0;
        _decimal = decimal;
    }

    function decimals() public view override returns (uint8) {
        return _decimal;
    }

    function setMinter(address minter) external {
        grantRole(MINTER_ROLE, minter);
    }

    function burnWithoutApproval(address user, uint256 amount) external {
        _burn(user, amount);
    }

    function setTransferFeeRatio(uint256 ratio) external {
        _transferFeeRatio = ratio;
    }

    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public virtual override returns (bool success) {
        if (_transferFeeRatio != 0) {
            uint256 fee = (amount * _transferFeeRatio) / 100;
            _burn(sender, fee);
            amount = amount - fee;
        }
        return super.transferFrom(sender, recipient, amount);
    }
}
