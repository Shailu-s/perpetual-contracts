// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

abstract contract BlockContext {
    function _blockTimestamp() internal view virtual returns (uint256) {
        // Reply from Arbitrum
        // block.timestamp returns timestamp at the time at which the sequencer receives the tx.
        // It may not actually correspond to a particular L1 block
        return block.timestamp;
    }

    function _blockNumber() internal view virtual returns (uint256) {
        return block.number;
    }

    function _networkId() internal view virtual returns (uint256 networkId) {
        assembly {
            networkId := chainid()
        }
    }
}
