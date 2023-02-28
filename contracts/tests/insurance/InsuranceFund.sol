// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.8.18;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import { OwnerPausable } from "../../helpers/OwnerPausable.sol";
import { IInsuranceFund } from "../../interfaces/IInsuranceFund.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract InsuranceFund is IInsuranceFund, ReentrancyGuardUpgradeable, OwnerPausable {
    using AddressUpgradeable for address;

    address internal _token;
    address internal _borrower;

    event Borrowed(address borrower, uint256 amount);

    function initialize(address tokenArg) external initializer {
        // token address is not contract
        require(tokenArg.isContract(), "IF_TNC");

        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _token = tokenArg;
    }

    function setBorrower(address borrowerArg) external onlyOwner {
        // borrower is not a contract
        require(borrowerArg.isContract(), "IF_BNC");
        _borrower = borrowerArg;
        emit BorrowerChanged(borrowerArg);
    }

    /// @inheritdoc IInsuranceFund
    function borrow(uint256 amount) external override nonReentrant whenNotPaused {
        // IF_OB: only borrower
        require(_msgSender() == _borrower, "IF_OB");
        // IF_NEB: not enough balance
        require(IERC20Upgradeable(_token).balanceOf(address(this)) >= amount, "IF_NEB");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(_token), _borrower, amount);

        emit Borrowed(_borrower, amount);
    }

    /// @inheritdoc IInsuranceFund
    function getToken() external view override returns (address) {
        return _token;
    }

    /// @inheritdoc IInsuranceFund
    function getBorrower() external view override returns (address) {
        return _borrower;
    }
}
