// copied from @opengsn/provider-2.2.4,
// https://github.com/opengsn/gsn/blob/master/packages/contracts/src/helpersRelayRecipient.sol
// for adding `payable` property at the return value of _msgSender()
// SPDX-License-Identifier: BUSL - 1.1
// solhint-disable no-inline-assembly
pragma solidity =0.8.12;

import "./IRelayRecipient.sol";

/**
 * A base contract to be inherited by any contract that want to receive relayed transactions
 * A subclass must use "_msgSender()" instead of "msg.sender"
 */
abstract contract BaseRelayRecipient is IRelayRecipient {
    /*
     * Forwarder singleton we accept calls from
     */
    address internal _trustedForwarder;

    // __gap is reserved storage
    uint256[50] private __gap;

    /**
     * return the sender of this call.
     * if the call came through our trusted forwarder, return the original sender.
     * otherwise, return `msg.sender`.
     * should be used in the contract anywhere instead of msg.sender
     */
    /// @inheritdoc IRelayRecipient
    function _msgSender() internal view virtual override returns (address ret) {
        if (msg.data.length >= 20) {
            // At this point we know that the sender is a trusted forwarder,
            // so we trust that the last bytes of msg.data are the verified sender address.
            // extract sender address from the end of msg.data
            assembly {
                ret := shr(96, calldataload(sub(calldatasize(), 20)))
            }
        } else {
            ret = msg.sender;
        }
    }
}
