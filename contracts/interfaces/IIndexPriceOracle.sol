// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "./IVolmexProtocol.sol";

interface IIndexPriceOracle {
    event BatchVolatilityTokenPriceUpdated(uint256[] _volatilityIndexes, uint256[] _volatilityTokenPrices, bytes32[] _proofHashes);
    event VolatilityIndexAdded(uint256 indexed volatilityTokenIndex, uint256 volatilityCapRatio, string volatilityTokenSymbol, uint256 volatilityTokenPrice);

    // Getter  methods
    function volatilityCapRatioByIndex(uint256 _index) external view returns (uint256);
    function volatilityTokenPriceProofHash(uint256 _index) external view returns (bytes32);
    function volatilityLastUpdateTimestamp(uint256 _index) external view returns (uint256);
    function indexCount() external view returns (uint256);
    function getIndexTwap(uint256 _index) external view returns (uint256 volatilityTokenTwap, uint256 iVolatilityTokenTwap, uint256 lastUpdateTimestamp);
    function getVolatilityTokenPriceByIndex(uint256 _index) external view returns (uint256 volatilityTokenPrice, uint256 iVolatilityTokenPrice, uint256 lastUpdateTimestamp);

    // Setter methods
    function updateBatchVolatilityTokenPrice(uint256[] memory _volatilityIndexes, uint256[] memory _volatilityTokenPrices, bytes32[] memory _proofHashes) external;
    function addVolatilityIndex(uint256 _volatilityTokenPrice, IVolmexProtocol _protocol, string calldata _volatilityTokenSymbol, uint256 _leverage, uint256 _baseVolatilityIndex, bytes32 _proofHash) external;
}
