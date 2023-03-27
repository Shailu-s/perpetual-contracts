// SPDX-License-Identifier: BUSL-1.1

pragma solidity =0.8.18;

import "@openzeppelin/contracts-upgradeable/utils/introspection/ERC165StorageUpgradeable.sol";

import "../interfaces/IIndexPriceOracle.sol";
import "./BaseOracle.sol";

/**
 * @title Volmex Oracle contract
 * @author volmex.finance [security@volmexlabs.com]
 */
contract IndexPriceOracle is BaseOracle, ERC165StorageUpgradeable {
    // Interface ID of VolmexOracle contract, hashId = 0xf9fffc9f
    bytes4 private constant _IVOLMEX_ORACLE_ID = type(IIndexPriceOracle).interfaceId;

    /**
     * @notice Initializes the contract setting the deployer as the initial owner.
     */
    function initialize(address _admin, uint256[] calldata _volatilityPrices, address[] calldata _volatilityIndex, bytes32[] calldata _proofHash, uint256[] calldata _capRatio) external initializer {
        _BaseOracle_init(_volatilityPrices, _volatilityIndex, _proofHash, _capRatio);
        _grantRole(PRICE_ORACLE_ADMIN, _admin);
        __ERC165Storage_init();
        _registerInterface(_IVOLMEX_ORACLE_ID);
    }

    /**
     * @notice Emulate the Chainlink Oracle interface for retrieving Volmex TWAP volatility index
     * @param _index Datapoints volatility index id {0}
     * @param _twInterval time for averaging observations
     * @return answer is the answer for the given round
     */
    function latestRoundData(uint256 _twInterval, uint64 _index) external view virtual returns (uint256 answer, uint256 lastUpdateTimestamp) {
        (answer, lastUpdateTimestamp) = _getCumulativePrice(_twInterval, _index);
        answer *= 100;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view virtual override(AccessControlUpgradeable, ERC165StorageUpgradeable) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
