// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;
import "../interfaces/IVaultController.sol";
import "../interfaces/IVolmexPerpPeriphery.sol";
import "hardhat/console.sol";

contract VaultMock {
    function deposit(
        IVolmexPerpPeriphery periphery,
        uint256 amount,
        address from
    ) external {
        IVaultController(msg.sender).deposit(periphery, from, msg.sender, amount);
    }

    function withdraw(uint256 amount, address to) external {
        console.log("here at vault");
        IVaultController(msg.sender).withdraw(msg.sender, to, amount);
    }
}
