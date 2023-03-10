// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { IERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";

interface IVirtualToken is IERC20Upgradeable {
    // Getters
    function isBase() external view returns (bool);

    // Setters
    function mint(address recipient, uint256 amount) external;
    function burn(address recipient, uint256 amount) external;
    function mintMaximumTo(address recipient) external;
}
