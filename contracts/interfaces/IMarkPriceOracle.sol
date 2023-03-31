// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "./IBaseOracle.sol";
import "./IIndexPriceOracle.sol";
import "./IPositioning.sol";

interface IMarkPriceOracle is IBaseOracle {
    function initialize(uint256[] calldata _priceCumulative, address[] calldata _asset, bytes32[] calldata _proofHash, uint256[] calldata _capRatio, address _admin) external;
    function addObservation(uint256 _underlyingPrice, uint256 _index, bytes32 _proofHash) external;
    function setIndexTwInterval(uint256 _indexTwInterval) external;
    function setMarkTwInterval(uint256 _markTwInterval) external;
    function setIndexOracle(IIndexPriceOracle _indexOracle) external;
    function setPositioning(IPositioning _positioning) external;

}
