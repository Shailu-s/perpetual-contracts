// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.18;

import { BaseOracle } from "./BaseOracle.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IIndexPriceOracle } from "../interfaces/IIndexPriceOracle.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";

/**
 * @title Volmex Oracle Mark SMA
 * @author volmex.finance [security@volmexlabs.com]
 */
contract MarkPriceOracle is BaseOracle {
    using LibSafeCastUint for uint256;

    IPositioning public positioning;
    IIndexPriceOracle public indexOracle;
    uint256 public markTwInterval;
    uint256 public indexTwInterval;

    /**
     * @notice Initialize the contract
     *
     * @param _priceCumulative Array of initial prices of the assets
     * @param _asset Array of addresses of the assets
     */
    function initialize(
        uint256[] calldata _priceCumulative,
        address[] calldata _asset,
        bytes32[] calldata _proofHash,
        uint256[] calldata _capRatio,
        address _admin
    ) external initializer {
        _BaseOracle_init(_priceCumulative, _asset, _proofHash, _capRatio);
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        markTwInterval = 300; // 5 minutes
        indexTwInterval = 3600; // 1 hour
    }

    /**
     * @notice Set positioning contract
     * @param _positioning Address of positioning contract typed in interface
     */
    function setPositioning(IPositioning _positioning) external virtual {
        _requireOracleAdmin();
        positioning = _positioning;
    }

    /**
     * @notice Set positioning contract
     * @param _indexOracle Address of positioning contract typed in interface
     */
    function setIndexOracle(IIndexPriceOracle _indexOracle) external virtual {
        _requireOracleAdmin();
        indexOracle = _indexOracle;
    }

    /**
     * @notice Set positioning contract
     * @param _markTwInterval Address of positioning contract typed in interface
     */
    function setMarkTwInterval(uint256 _markTwInterval) external virtual {
        _requireOracleAdmin();
        markTwInterval = _markTwInterval;
    }

    /**
     * @notice Set positioning contract
     * @param _indexTwInterval Address of positioning contract typed in interface
     */
    function setIndexTwInterval(uint256 _indexTwInterval) external virtual {
        _requireOracleAdmin();
        indexTwInterval = _indexTwInterval;
    }

    function getMarkPrice(address _baseToken, uint64 _index) external view returns (int256 markPrice) {
        int256 lastFundingRate = positioning.getLastFundingRate(_baseToken);
        uint256 nextFunding = positioning.getLastSettledTimestampMap(_baseToken);
        uint256 fundingPeriod = positioning.getFundingPeriod();

        int256[3] memory prices;
        int256 indexPrice = indexOracle.getCumulativePrice(indexTwInterval, _index).toInt256();
        // Note: Check for actual precision and data type
        prices[0] = indexPrice * (1 + lastFundingRate * (nextFunding.toInt256() / fundingPeriod.toInt256()));
        (uint256 markTwap,) = _getCumulativePrice(markTwInterval, _index);
        prices[1] = markTwap.toInt256();
        prices[2] = getLatestPrice(_index).toInt256();
        markPrice = LibPerpMath.median(prices[0], prices[1], prices[2]);
    }
}
