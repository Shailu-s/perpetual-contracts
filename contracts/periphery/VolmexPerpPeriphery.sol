// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../libs/LibOrder.sol";

import "../helpers/RoleManager.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IVolmexPerpPeriphery.sol";

contract VolmexPerpPeriphery is Initializable, RoleManager, IVolmexPerpPeriphery {
    // Save positioning & vaulcontroller

    // Used to set the index of positioning
    uint256 public positioningIndex;

    // Used to set the index of vaultController
    uint256 public vaultControllerIndex;

    // Store the addresses of positionings { index => positioning address }
    mapping(uint256 => IPositioning) public positionings;

    // Store the addresses of vaultControllers { index => vaultController address }
    mapping(uint256 => IVaultController) public vaultControllers;

    IMarkPriceOracle public markPriceOracle;

    // Store the address of relayer
    address public relayer;

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
        address _owner,
        address _relayer
    ) external initializer {
        require(_owner != address(0), "Admin can't be address(0)");
        require(_relayer != address(0), "Relayer can't be address(0)");
        markPriceOracle = _markPriceOracle;

        for (uint256 i = 0; i < 2; i++) {
            positionings[i] = _positioning[i];
            vaultControllers[i] = _vaultController[i];
        }
        // Since we are adding two addresses, hence updating indexes to 2
        positioningIndex = 2;
        vaultControllerIndex = 2;
        relayer = _relayer;
        _grantRole(VOLMEX_PERP_PERIPHERY, _owner);
        _grantRole(RELAYER_MULTISIG, _relayer);
    }


    function setMarkPriceOracle(IMarkPriceOracle _markPriceOracle) external {
        _requireVolmexPerpPeripheryAdmin();
        markPriceOracle = _markPriceOracle;
    }

    function setRelayer(address _relayer) external {
        _requireVolmexPerpPeripheryAdmin();
        require(_relayer != address(0), "VolmexPerpPeriphery: Not relayer");
        address oldRelayerAddress = relayer;
        relayer = _relayer;
        emit RelayerUpdated(oldRelayerAddress, _relayer);
    }

    /**
     * @notice Used to set the Positioning on new index
     *
     * @param _positioning Address of the positioning contract
     */
    function addPositioning(IPositioning _positioning) external {
        _requireVolmexPerpPeripheryAdmin();
        positionings[positioningIndex] = _positioning;
        emit PositioningAdded(positioningIndex, address(_positioning));
        positioningIndex++;
    }

    /**
     * @notice Used to set the VaultController on new index
     *
     * @param _vaultController Address of the vaultController contract
     */
    function addVaultController(IVaultController _vaultController) external {
        _requireVolmexPerpPeripheryAdmin();
        vaultControllers[vaultControllerIndex] = _vaultController;
        emit VaultControllerAdded(vaultControllerIndex, address(_vaultController));
        vaultControllerIndex++;
    }

    function fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder,
        bytes memory liquidator,
        uint256 _index
    ) external {
        _requireVolmexPerpPeripheryRelayer();
        _fillLimitOrder(
            _leftLimitOrder, 
            _signatureLeftLimitOrder, 
            _rightLimitOrder, 
            _signatureRightLimitOrder,
            liquidator,
            _index
        );
    }

    function _fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder,
        bytes memory liquidator,
        uint256 _index
    ) internal {
        _verifyTriggerPrice(_leftLimitOrder);
        _verifyTriggerPrice(_rightLimitOrder);

		IPositioning(positionings[_index]).openPosition(
			_leftLimitOrder, 
			_signatureLeftLimitOrder, 
			_rightLimitOrder,
			_signatureRightLimitOrder,
            liquidator
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
                require(triggeredPrice <= _limitOrder.triggerPrice, "Periphery: Sell Stop Limit Order Trigger Price Not Matched");
            } else {
                require(triggeredPrice >= _limitOrder.triggerPrice, "Periphery: Buy Stop Limit Order Trigger Price Not Matched");
            }
        } else if (_limitOrder.orderType == LibOrder.TAKE_PROFIT_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                require(
                    triggeredPrice >= _limitOrder.triggerPrice,
                    "Periphery: Sell Take-profit Limit Order Trigger Price Not Matched"
                );
            } else {
                require(
                    triggeredPrice <= _limitOrder.triggerPrice,
                    "Periphery: Buy Take-profit Limit Order Trigger Price Not Matched"
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
     * @notice Used to update the Positioning at index
     *
     * @param _oldPositioning Address of the old positioning contract
     * @param _newPositioning Address of the new positioning contract
     * @param _index Index of positioning to update
     */
    function updatePositioningAtIndex(
        IPositioning _oldPositioning,
        IPositioning _newPositioning,
        uint256 _index
    ) external {
        _requireVolmexPerpPeripheryAdmin();
        require(positionings[_index] == _oldPositioning, "Periphery: Incorrect positioning _index");
        positionings[_index] = _newPositioning;
        emit PositioningUpdated(_index, address(_oldPositioning), address(_newPositioning));
    }

    /**
     * @notice Used to update the VaultController at index
     *
     * @param _oldVaultController Address of the old vaultController contract
     * @param _newVaultController Address of the new vaultController contract
     * @param _index Index of vault controller to update
     */
    function updateVaultControllerAtIndex(
        IVaultController _oldVaultController,
        IVaultController _newVaultController,
        uint256 _index
    ) external {
        _requireVolmexPerpPeripheryAdmin();
        require(
            vaultControllers[_index] == _oldVaultController,
            "Periphery: Incorrect vault controller _index"
        );
        vaultControllers[_index] = _newVaultController;
    }

    function depositToVault(
        uint64 _index,
        address _token,
        uint256 _amount
    ) external payable {
        /**
        Getter for _isEthVault in Vault contract
            - Check the msg.value and send it to vault controller
         */
        vaultControllers[_index].deposit{ value: msg.value }(
            IVolmexPerpPeriphery(address(this)),
            _token,
            _msgSender(),
            _amount
        );
    }

    function withdrawFromVault(
        uint64 _index,
        address _token,
        address payable _to,
        uint256 _amount
    ) external {
        vaultControllers[_index].withdraw(_token, _to, _amount);
    }

    function openPosition(
        uint64 _index,
        LibOrder.Order memory _orderLeft,
        bytes memory _signatureLeft,
        LibOrder.Order memory _orderRight,
        bytes memory _signatureRight,
        bytes memory liquidator
    ) external {
        _requireVolmexPerpPeripheryRelayer();
        positionings[_index].openPosition(_orderLeft, _signatureLeft, _orderRight, _signatureRight, liquidator);
    }

    function batchOpenPosition(
        uint64 _index,
        LibOrder.Order[] memory _ordersLeft,
        bytes[] memory _signaturesLeft,
        LibOrder.Order[] memory _ordersRight,
        bytes[] memory _signaturesRight,
        bytes memory liquidator
    ) external {
        require(_ordersLeft.length == _ordersRight.length, "Periphery: mismatch orders");
        IPositioning positioning = positionings[_index];
        uint256 ordersLength = _ordersLeft.length;
        for(uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            positioning.openPosition(
                _ordersLeft[orderIndex],
                _signaturesLeft[orderIndex],
                _ordersRight[orderIndex],
                _signaturesRight[orderIndex],
                liquidator
            );
        }
    }

    function batchFillLimitOrders(
        uint256 _index,
        LibOrder.Order[] memory _leftLimitOrders,
        bytes[] memory _signaturesLeftLimitOrder,
        LibOrder.Order[] memory _rightLimitOrders,
        bytes[] memory _signaturesRightLimitOrder,
        bytes memory liquidator
    ) external {
        require(_leftLimitOrders.length == _rightLimitOrders.length, "Periphery: mismatch limit orders");
        uint256 ordersLength = _leftLimitOrders.length;
        for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            _fillLimitOrder(
                _leftLimitOrders[orderIndex],
                _signaturesLeftLimitOrder[orderIndex],
                _rightLimitOrders[orderIndex],
                _signaturesRightLimitOrder[orderIndex],
                liquidator,
                _index
            );
        }
    }

    function transferToVault(
        IERC20Upgradeable _token,
        address _from,
        uint256 _amount
    ) external {
        // TODO: Add msg.sender is vault require check here - "Periphery: Caller is not vault"
        _token.transferFrom(_from, _msgSender(), _amount);
    }

    /**
        Internal view functions
     */
    function _requireVolmexPerpPeripheryAdmin() internal view {
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "Periphery: Not admin");
    }

    function _requireVolmexPerpPeripheryRelayer() internal view {
        require(hasRole(RELAYER_MULTISIG, _msgSender()), "VolmexPerpPeriphery: Not relayer");
    }
}
