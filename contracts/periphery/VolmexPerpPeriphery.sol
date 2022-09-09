// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "../libs/LibOrder.sol";

import "../helpers/RoleManager.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IVolmexPerpPeriphery.sol";

contract VolmexPerpPeriphery is Initializable, RoleManager {
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
            positionings[i] = _positioning[i];
            vaultControllers[i] = _vaultController[i];
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
        positionings[positioningIndex] = _positioning;
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
        bytes memory _signatureRight
    ) external {
        positionings[_index].openPosition(_orderLeft, _signatureLeft, _orderRight, _signatureRight);
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
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "VolmexPerpPeriphery: Not admin");
    }
}
