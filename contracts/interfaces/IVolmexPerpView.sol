// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "./IPositioning.sol";
import "./IVaultController.sol";
import "./IVolmexBaseToken.sol";
import "./IVolmexQuoteToken.sol";
import "./IAccountBalance.sol";
import "./IMarketRegistry.sol";

interface IVolmexPerpView {
    function perpIndexCount() external view returns (uint256);
    function vaultIndexCount() external view returns (uint256);
    function baseTokenIndexCount() external view returns (uint256);
    function quoteTokenIndexCount() external view returns (uint256);
    function positionings(uint256 _index) external view returns (IPositioning);
    function vaultControllers(uint256 _index) external view returns (IVaultController);
    function baseTokens(uint256 _index) external view returns (IVolmexBaseToken);
    function quoteTokens(uint256 _index) external view returns (IVolmexQuoteToken);
    function accounts(uint256 _index) external view returns (IAccountBalance);
    function marketRegistries(uint256 _index) external view returns (IMarketRegistry);
    function setBaseToken(IVolmexBaseToken _baseToken) external;
    function setQuoteToken(IVolmexQuoteToken _quoteToken) external;
    function setPositioning(IPositioning _positioning) external;
    function setVaultController(IVaultController _vaultController) external;
    function setAccount(IAccountBalance _account) external;
    function setMarketRegistry(IMarketRegistry _marketRegistry) external;
    function incrementPerpIndex() external;
    function incrementVaultIndex() external;
}
