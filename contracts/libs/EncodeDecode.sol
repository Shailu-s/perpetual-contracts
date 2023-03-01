// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

library EncodeDecode {
    /**
     * @dev Used to encode address to bytes
     *
     * @param _account type address
     * @return hash of encoded address
     */
    function encodeAddress(address _account) internal pure returns (bytes memory) {
        return abi.encode(_account);
    }

    /**
     * @dev Used to decode bytes for address
     *
     * @param _account type bytes
     * @return address of decode hash
     */
    function decodeAddress(bytes memory _account) internal pure returns (address) {
        return abi.decode(_account, (address));
    }
}
