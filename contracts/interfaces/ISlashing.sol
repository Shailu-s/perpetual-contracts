// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

interface ISlashing {
    // method to for relayers to stake tokens
    function stake(address _onBehalfOf, uint256 _amount) external;

    // method for relayers to unstake their collateral
    // to unstake relayers first need to cooldown the amount of collateral they need to unstake
    // relayer can only unstake once they are cooldown period is over
    function unstake(address to) external;

    // for other relayers to slash funds from malicious relayer.
    function slash(address relayer) external;
}
