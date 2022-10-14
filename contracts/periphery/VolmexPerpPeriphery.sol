// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../helpers/RoleManager.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVaultController.sol";

contract VolmexPerpPeriphery is Initializable, RoleManager {
    // Save positioning & vaulcontroller
    
    // Used to set the index of positioning
    uint256 public positioningIndex;

    // Used to set the index of vaultController
    uint256 public vaultControllerIndex;

    // Store the addresses of positionings { index => positioning address }
    mapping(uint256 => address) public positionings;

    // Store the addresses of vaultControllers { index => vaultController address }
    mapping(uint256 => address) public vaultControllers;

    IMarkPriceOracle public markPriceOracle;

    /**
     * @notice Initializes the contract
     *
     * @dev Sets the positioning & vaultControllers
     *
     * @param _positioning Array of the positioning contract
     * @param _vaultController Array of the vaultController contract
     */
    function initialize(
        IPositioning[2] memory _positioning,
        IVaultController[2] memory _vaultController,
        IMarkPriceOracle _markPriceOracle,
        address _owner
    ) external initializer {
        require(_owner != address(0), "Admin can't be address(0)");
        markPriceOracle = _markPriceOracle;

        for (uint256 i = 0; i < 2; i++) {
            positionings[i] = address(_positioning[i]);
            vaultControllers[i] = address(_vaultController[i]);
        }
        // Since we are adding two addresses, hence updating indexes to 2
        positioningIndex = 2;
        vaultControllerIndex = 2;
        _grantRole(VOLMEX_PERP_PERIPHERY, _owner);
    }


    function setMarkPriceOracle(IMarkPriceOracle _markPriceOracle) external {
        _requireVolmexPerpPeripheryAdmin();
        markPriceOracle = _markPriceOracle;
    }

    /**
     * @notice Used to set the Positioning on new index
     *
     * @param _positioning Address of the positioning contract
     */
    function addPositioning(IPositioning _positioning) external {
        _requireVolmexPerpPeripheryAdmin();
        positionings[positioningIndex] = address(_positioning);
        positioningIndex++;
    }

    /**
     * @notice Used to set the VaultController on new index
     *
     * @param _vaultController Address of the vaultController contract
     */
    function addVaultController(IVaultController _vaultController) external {
        _requireVolmexPerpPeripheryAdmin();
        vaultControllers[vaultControllerIndex] = address(_vaultController);
        vaultControllerIndex++;
    }

    function fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder,
        uint256 _index
    ) external {
        _fillLimitOrder(
            _leftLimitOrder, 
            _signatureLeftLimitOrder, 
            _rightLimitOrder, 
            _signatureRightLimitOrder,
            _index
        );
    }

    function _fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder,
        uint256 _index
    ) internal {
        _verifyTriggerPrice(_leftLimitOrder);
        _verifyTriggerPrice(_rightLimitOrder);

		IPositioning(positionings[_index]).openPosition(
			_leftLimitOrder, 
			_signatureLeftLimitOrder, 
			_rightLimitOrder,
			_signatureRightLimitOrder
		);
    }

    // TODO: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LibOrder.Order memory _limitOrder) internal view {
        if (_limitOrder.orderType == LibOrder.ORDER) {
            return;
        }
        // TODO: Add check for round id, when Volmex Oracle updates functionality
        // TODO Ask and update this hardhcoded time reference for tw interval
        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder, 15 minutes); 

        if (_limitOrder.orderType == LibOrder.STOP_LOSS_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                require(triggeredPrice <= _limitOrder.triggerPrice, "Sell Stop Limit Order Trigger Price Not Matched");
            } else {
                require(triggeredPrice >= _limitOrder.triggerPrice, "Buy Stop Limit Order Trigger Price Not Matched");
            }
        } else if (_limitOrder.orderType == LibOrder.TAKE_PROFIT_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                require(
                    triggeredPrice >= _limitOrder.triggerPrice,
                    "Sell Take-profit Limit Order Trigger Price Not Matched"
                );
            } else {
                require(
                    triggeredPrice <= _limitOrder.triggerPrice,
                    "Buy Take-profit Limit Order Trigger Price Not Matched"
                );
            }
        }
    }

    // TODO: Add round id in the Volmex oracle to faciliate the chainlink oracle functionality
    function _getBaseTokenPrice(LibOrder.Order memory _order, uint256 _twInterval) internal view returns (uint256 price) {
        // TODO: Add Order validate, similar to -> LibOrder.validate(order);

        address makeAsset = _order.makeAsset.virtualToken;
        address takeAsset = _order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        uint64 _index = markPriceOracle.indexByBaseToken(baseToken);
        return markPriceOracle.getCumulativePrice(_twInterval, _index);
    }

    /**
        Internal view functions
     */
    function _requireVolmexPerpPeripheryAdmin() internal view {
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "VolmexPerpPeriphery: Not admin");
    }
    
}