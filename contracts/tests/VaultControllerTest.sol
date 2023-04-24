// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;
import "../interfaces/IVault.sol";
import "../interfaces/IVolmexPerpPeriphery.sol";

contract VaultControllerTest {
    function withdraw(
        uint256 amount,
        address to,
        IVault vault
    ) external {
        vault.withdraw(amount, to);
    }

    function deposit(
        IVolmexPerpPeriphery periphery,
        address trader,
        uint256 amount,
        IVault vault
    ) external {
        vault.deposit(periphery, amount, trader);
    }
}
