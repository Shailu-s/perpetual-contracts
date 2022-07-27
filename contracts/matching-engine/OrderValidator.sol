// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.12;

import { EIP712Upgradeable } from "@openzeppelin/contracts-upgradeable/utils/cryptography/draft-EIP712Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

import "../interfaces/IERC1271.sol";
import "../libs/LibOrder.sol";
import "../libs/LibSignature.sol";

abstract contract OrderValidator is Initializable, ContextUpgradeable, EIP712Upgradeable {
    using LibSignature for bytes32;
    using AddressUpgradeable for address;
    
    bytes4 constant internal MAGICVALUE = 0x1626ba7e;

    mapping(address => uint256) public makerMinSalt;

    function __OrderValidator_init_unchained() internal initializer {
        __EIP712_init_unchained("V_PERP", "1");
    }

    function validate(LibOrder.Order memory order, bytes memory signature) internal view {
        if (order.salt == 0) {
            if (order.trader != address(0)) {
                require(_msgSender() == order.trader, "OrderValidator: maker is not tx sender");
            } else {
                order.trader = _msgSender();
            }
        } else {
            require(
                (order.salt >= makerMinSalt[order.trader]),
                "OrderValidator: Order canceled"
            );
            if (_msgSender() != order.trader) {
                bytes32 hash = LibOrder.hash(order);
                address signer;
                if (signature.length == 65) {
                    signer = _hashTypedDataV4(hash).recover(signature);
                }
                if  (signer != order.trader) {
                    if (order.trader.isContract()) {
                        require(
                            IERC1271(order.trader).isValidSignature(_hashTypedDataV4(hash), signature) == MAGICVALUE,
                            "OrderValidator: contract order signature verification error"
                        );
                    } else {
                        revert("OrderValidator: order signature verification error");
                    }
                } else {
                    require (order.trader != address(0), "OrderValidator: no trader");
                }
            }
        }
    }

    uint256[50] private __gap;
}
