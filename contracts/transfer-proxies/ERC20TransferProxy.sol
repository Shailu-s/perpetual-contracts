// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import "../helpers/OperatorRole.sol";
import "../interfaces/IERC20TransferProxy.sol";

contract ERC20TransferProxy is
    IERC20TransferProxy,
    Initializable,
    OperatorRole
{
    function erc20TransferProxyInit(address exchange, address owner)
        external
        initializer
    {
        __OperatorRole_init(exchange);

        _transferOwnership(owner);
    }

    function erc20SafeTransferFrom(
        IERC20Upgradeable token,
        address from,
        address to,
        uint256 value
    ) external override onlyOperator {
        require(
            token.transferFrom(from, to, value),
            "ERC20TransferProxy: failure while transferring"
        );
    }
}
