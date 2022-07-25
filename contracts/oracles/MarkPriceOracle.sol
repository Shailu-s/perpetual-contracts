// SPDX-License-Identifier: BUSL-1.1
pragma solidity =0.8.12;

import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

/**
 * @title Volmex Oracle Mark SMA
 * @author volmex.finance [security@volmexlabs.com]
 */
contract MarkPriceOracle is Initializable {
    using SafeMathUpgradeable for uint256;

    struct Observation {
        uint256 timestamp;
        uint256 priceCumulative;
    }

    // Address of the Exchange contract
    address public exchange;

    // mapping to store index to the address of the baseToken
    mapping(uint256 => address) public indexToBaseToken;

    // mapping to store baseToken to Observations 
    mapping(address => Observation[]) public baseTokenToObservations;

    // Used to check the caller is Exchange contract
    modifier onlyExchange() {
        require(msg.sender == exchange, "MarkSMA: Not Exchange");
        _;
    }

    /**
     * @notice Initialize the contract
     *
     * @param _exchange Address of the Exchange contract
     * @param _priceCumulative Initial price of the asset
     * @param _asset Address of the asset
     */
    function initialize(address _exchange, uint256 _priceCumulative, address _asset) external initializer {
        require(_exchange != address(0), "MarkSMA: Not zero address");
        require(_priceCumulative > 1000000, "MarkSMA: Not decimal precise");
        require(_asset != address(0), "MarkSMA: Asset address can't be 0");
        exchange = _exchange;
        Observation memory observation = Observation({ timestamp: block.timestamp, priceCumulative: _priceCumulative });
        indexToBaseToken[0] = _asset;
        Observation[] storage observations = baseTokenToObservations[_asset];
        observations.push(observation);
    }

    /**
     * @notice Used to add price cumulative of an asset at a given timestamp
     *
     * @param _priceCumulative Price of the asset
     */    
    function addObservation(uint256 _priceCumulative, uint256 _index) external onlyExchange {
        require(_priceCumulative > 1000000, "MarkSMA: Not decimal precise");
        Observation memory observation = Observation({ timestamp: block.timestamp, priceCumulative: _priceCumulative });
        address baseTokenAddr = indexToBaseToken[_index];
        require(baseTokenAddr != address(0), "MarkSMA: Base token not found");
        Observation[] storage observations = baseTokenToObservations[baseTokenAddr];
        observations.push(observation);
    }

    /**
     * @notice Get the single moving average price of the asset
     *
     * @param _twInterval Time in seconds of the range
     * @return priceCumulative The SMA price of the asset
     */
    function getCumulativePrice(uint256 _twInterval, uint256 _index) external view returns (uint256 priceCumulative) {
        address baseTokenAddr = indexToBaseToken[_index];
        require(baseTokenAddr != address(0), "MarkSMA: Base token not found");
        Observation[] memory observations = baseTokenToObservations[baseTokenAddr];
        uint256 index = observations.length - 1;
        uint256 initialTimestamp = block.timestamp - _twInterval;
        for (index = observations.length - 1; observations[index].timestamp >= initialTimestamp; index--) {
            priceCumulative += observations[index].priceCumulative;
        }
        priceCumulative = priceCumulative.div(observations.length.sub(index));
    }
}
