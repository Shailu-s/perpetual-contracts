// SPDX-License-Identifier: BUSL - 1.1

pragma solidity =0.8.18;

import "./ERC1271.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

contract ERC1271Test is ERC1271 {
    bool private _returnSuccessfulValidSignature;

    function setReturnSuccessfulValidSignature(bool value) public {
        _returnSuccessfulValidSignature = value;
    }

    function isValidSignature(bytes32, bytes memory) public view override returns (bytes4) {
        return _returnSuccessfulValidSignature ? ERC1271_RETURN_VALID_SIGNATURE : ERC1271_RETURN_INVALID_SIGNATURE;
    }

    function getAllowance(address _addr, address _virtualTokenAddr) public {
        IVirtualToken(_virtualTokenAddr).approve(_addr, 1000000000000000);
    }
}
