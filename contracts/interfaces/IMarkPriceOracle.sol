// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "./IBaseOracle.sol";

interface IMarkPriceOracle is IBaseOracle {
    function initialize(uint256[] calldata _priceCumulative, address[] calldata _asset, bytes32[] calldata _proofHash, uint256[] calldata _capRatio, address _admin) external;
}
