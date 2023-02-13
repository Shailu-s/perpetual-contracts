// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import "../libs/LibOrder.sol";
import "../interfaces/IMarkPriceOracle.sol";
import "../interfaces/IPositioning.sol";
import "../interfaces/IVaultController.sol";
import "../interfaces/IVolmexPerpPeriphery.sol";
import "../interfaces/IVolmexPerpView.sol";
import "../interfaces/IPositioningConfig.sol";

contract VolmexPerpPeriphery is Initializable, AccessControlUpgradeable, IVolmexPerpPeriphery {
    // perp periphery role
    bytes32 public constant VOLMEX_PERP_PERIPHERY = keccak256("VOLMEX_PERP_PERIPHERY");
    // role of relayer to execute open position
    bytes32 public constant RELAYER_MULTISIG = keccak256("RELAYER_MULTISIG");

    // Store the whitelist Vaults
    mapping(address => bool) private _isVaultWhitelist;

    // Used to fetch base token price according to market
    IMarkPriceOracle public markPriceOracle;
    // Stores the address of VolmexPerpView contract
    IVolmexPerpView public perpView;

    /**
     * @notice Initializes the contract
     *
     * @dev Sets the positioning & vaultControllers
     *
     * @param _perpView Address of PerpView contractt
     * @param _owner Address of the admin EOA
     * @param _relayer Address of relayer to execute open position
     */
    function initialize(
        IVolmexPerpView _perpView,
        IMarkPriceOracle _markPriceOracle,
        address[2] memory _vaults,
        address _owner,
        address _relayer
    ) external initializer {
        require(_owner != address(0), "VolmexPerpPeriphery: Admin can't be address(0)");
        require(_relayer != address(0), "VolmexPerpPeriphery: Relayer can't be address(0)");
        require(address(_perpView) != address(0), "VolmexPerpPeriphery: zero address");
        markPriceOracle = _markPriceOracle;
        perpView = _perpView;

        for (uint256 i = 0; i < 2; i++) {
            _isVaultWhitelist[_vaults[i]] = true;
        }
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
        _grantRole(RELAYER_MULTISIG, _relayer);
        emit RelayerUpdated(_relayer);
    }

    function whitelistVault(address _vault, bool _isWhitelist) external {
        _requireVolmexPerpPeripheryAdmin();
        _isVaultWhitelist[_vault] = _isWhitelist;
        emit VaultWhitelisted(_vault, _isWhitelist);
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
        _fillLimitOrder(_leftLimitOrder, _signatureLeftLimitOrder, _rightLimitOrder, _signatureRightLimitOrder, liquidator, _index);
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
        IVaultController vaultController = perpView.vaultControllers(_index);
        vaultController.deposit{ value: msg.value }(IVolmexPerpPeriphery(address(this)), _token, _msgSender(), _amount);
    }

    function withdrawFromVault(
        uint64 _index,
        address _token,
        address payable _to,
        uint256 _amount
    ) external {
        IVaultController vaultController = perpView.vaultControllers(_index);
        vaultController.withdraw(_token, _to, _amount);
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
        IPositioning positioning = perpView.positionings(_index);
        positioning.openPosition(_orderLeft, _signatureLeft, _orderRight, _signatureRight, liquidator);
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
        _requireVolmexPerpPeripheryRelayer();
        IPositioning positioning = perpView.positionings(_index);
        uint256 ordersLength = _ordersLeft.length;
        for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            positioning.openPosition(_ordersLeft[orderIndex], _signaturesLeft[orderIndex], _ordersRight[orderIndex], _signaturesRight[orderIndex], liquidator);
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
        _requireVolmexPerpPeripheryRelayer();
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
        address caller = _msgSender();
        require(_isVaultWhitelist[caller], "Periphery: vault not whitelisted");
        _token.transferFrom(_from, caller, _amount);
    }

    /**
        Internal view functions
     */

    function _fillLimitOrder(
        LibOrder.Order memory _leftLimitOrder,
        bytes memory _signatureLeftLimitOrder,
        LibOrder.Order memory _rightLimitOrder,
        bytes memory _signatureRightLimitOrder,
        bytes memory liquidator,
        uint256 _index
    ) internal {
        IPositioning positioning = perpView.positionings(_index);
        if (_leftLimitOrder.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_leftLimitOrder, positioning), "Periphery: left order price verification failed");
        if (_rightLimitOrder.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_rightLimitOrder, positioning), "Periphery: right order price verification failed");

        positioning.openPosition(_leftLimitOrder, _signatureLeftLimitOrder, _rightLimitOrder, _signatureRightLimitOrder, liquidator);
    }

    function _requireVolmexPerpPeripheryAdmin() internal view {
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "Periphery: Not admin");
    }

    function _requireVolmexPerpPeripheryRelayer() internal view {
        require(hasRole(RELAYER_MULTISIG, _msgSender()), "VolmexPerpPeriphery: Not relayer");
    }

    // TODO: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LibOrder.Order memory _limitOrder, IPositioning _positioning) private view returns (bool) {
        // TODO: Add check for round id, when Volmex Oracle updates functionality

        address positioningConfig = _positioning.getPositioningConfig();
        uint32 twInterval = IPositioningConfig(positioningConfig).getTwapInterval();

        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder, twInterval);

        if (_limitOrder.orderType == LibOrder.STOP_LOSS_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                // Sell Stop Limit Order Trigger Price Not Matched
                return triggeredPrice <= _limitOrder.triggerPrice;
            } else {
                // Buy Stop Limit Order Trigger Price Not Matched
                return triggeredPrice >= _limitOrder.triggerPrice;
            }
        } else if (_limitOrder.orderType == LibOrder.TAKE_PROFIT_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                // Sell Take-profit Limit Order Trigger Price Not Matched
                return triggeredPrice >= _limitOrder.triggerPrice;
            } else {
                // Buy Take-profit Limit Order Trigger Price Not Matched
                return triggeredPrice <= _limitOrder.triggerPrice;
            }
        }
        return false;
    }

    // TODO: Changes might require if we integrate chainlink, which are related to round_id
    function _getBaseTokenPrice(LibOrder.Order memory _order, uint256 _twInterval) private view returns (uint256 price) {
        address makeAsset = _order.makeAsset.virtualToken;
        address takeAsset = _order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        uint64 _index = markPriceOracle.indexByBaseToken(baseToken);
        return markPriceOracle.getCumulativePrice(_twInterval, _index);
    }
}
