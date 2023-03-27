// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import "./BaseOracle.sol";

/**
 * @title Volmex Oracle Mark SMA
 * @author volmex.finance [security@volmexlabs.com]
 */
contract MarkPriceOracle is BaseOracle {
    /**
     * @notice Initialize the contract
     *
     * @param _priceCumulative Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function initialize(uint256[] calldata _priceCumulative, address[] calldata _asset, bytes32[] calldata _proofHash, uint256[] calldata _capRatio, address _admin) external initializer {
        _BaseOracle_init(_priceCumulative, _asset, _proofHash, _capRatio);
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
    }
}
