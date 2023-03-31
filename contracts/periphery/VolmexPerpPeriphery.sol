// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

import {LibOrder} from "../libs/LibOrder.sol";
import {IMarkPriceOracle} from "../interfaces/IMarkPriceOracle.sol";
import {IIndexPriceOracle} from "../interfaces/IIndexPriceOracle.sol";
import {IPositioning} from "../interfaces/IPositioning.sol";
import {IVaultController} from "../interfaces/IVaultController.sol";
import {IVolmexPerpPeriphery, IERC20Upgradeable, IVirtualToken} from "../interfaces/IVolmexPerpPeriphery.sol";
import {IVolmexPerpView} from "../interfaces/IVolmexPerpView.sol";
import {IPositioningConfig} from "../interfaces/IPositioningConfig.sol";

contract VolmexPerpPeriphery is AccessControlUpgradeable, IVolmexPerpPeriphery {
    // perp periphery role
    bytes32 public constant VOLMEX_PERP_PERIPHERY = keccak256("VOLMEX_PERP_PERIPHERY");
    // role of relayer to execute open position
    bytes32 public constant RELAYER_MULTISIG = keccak256("RELAYER_MULTISIG");

    // Store the whitelist Vaults
    mapping(address => bool) private _isVaultWhitelist;
    
    // Store the whitelist traders
    mapping(address => bool) public isTraderWhitelisted;

    // Boolean flag to enable / disable whitelisted traders
    bool public isTraderWhitelistEnabled;

    // Used to fetch base token price according to market
    IMarkPriceOracle public markPriceOracle;
    // Used to fetch base volatility token index price
    IIndexPriceOracle public indexPriceOracle;
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
        IIndexPriceOracle _indexPriceOracle,
        address[2] memory _vaults,
        address _owner,
        address _relayer
    ) external initializer {
        require(_owner != address(0), "VolmexPerpPeriphery: Admin can't be address(0)");
        require(_relayer != address(0), "VolmexPerpPeriphery: Relayer can't be address(0)");
        require(address(_perpView) != address(0), "VolmexPerpPeriphery: zero address");
        markPriceOracle = _markPriceOracle;
        indexPriceOracle = _indexPriceOracle;
        perpView = _perpView;

        for (uint256 i = 0; i < 2; i++) {
            _isVaultWhitelist[_vaults[i]] = true;
        }
        isTraderWhitelistEnabled = true;
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

    function toggleTraderWhitelistEnabled() external {
        _requireVolmexPerpPeripheryAdmin();
        isTraderWhitelistEnabled = !isTraderWhitelistEnabled;
    }

    function whitelistVault(address _vault, bool _isWhitelist) external {
        _requireVolmexPerpPeripheryAdmin();
        _isVaultWhitelist[_vault] = _isWhitelist;
        emit VaultWhitelisted(_vault, _isWhitelist);
    }

    function whitelistTrader(address _trader, bool _isWhitelist) external {
        _requireVolmexPerpPeripheryAdmin();
        isTraderWhitelisted[_trader] = _isWhitelist;
        emit TraderWhitelisted(_trader, _isWhitelist);
    }

    function depositToVault(
        uint256 _index,
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
        uint256 _index,
        address _token,
        address payable _to,
        uint256 _amount
    ) external {
        IVaultController vaultController = perpView.vaultControllers(_index);
        vaultController.withdraw(_token, _to, _amount);
    }

    function openPosition(
        uint256 _index,
        LibOrder.Order memory _orderLeft,
        bytes memory _signatureLeft,
        LibOrder.Order memory _orderRight,
        bytes memory _signatureRight,
        bytes memory liquidator
    ) external {
        _requireVolmexPerpPeripheryRelayer();
        if (isTraderWhitelistEnabled) {
            _requireWhitelistedTrader(_orderLeft.trader);
            _requireWhitelistedTrader(_orderRight.trader);
        }
        _openPosition(_index, _orderLeft, _signatureLeft, _orderRight, _signatureRight, liquidator);
    }

    function batchOpenPosition(
        uint256 _index,
        LibOrder.Order[] memory _ordersLeft,
        bytes[] memory _signaturesLeft,
        LibOrder.Order[] memory _ordersRight,
        bytes[] memory _signaturesRight,
        bytes memory liquidator
    ) external {
        require(_ordersLeft.length == _ordersRight.length, "Periphery: mismatch orders");
        _requireVolmexPerpPeripheryRelayer();

        uint256 ordersLength = _ordersLeft.length;
        bool _isTraderWhitelistEnabled = isTraderWhitelistEnabled;
        if (_isTraderWhitelistEnabled) {
            for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
                _requireWhitelistedTrader(_ordersLeft[orderIndex].trader);
                _requireWhitelistedTrader(_ordersRight[orderIndex].trader);
            }
        }

        for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            _openPosition(_index, _ordersLeft[orderIndex], _signaturesLeft[orderIndex], _ordersRight[orderIndex], _signaturesRight[orderIndex], liquidator);
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

    function _openPosition(
        uint256 _index,
        LibOrder.Order memory _orderLeft,
        bytes memory _signatureLeft,
        LibOrder.Order memory _orderRight,
        bytes memory _signatureRight,
        bytes memory liquidator
    ) internal {
        IPositioning positioning = perpView.positionings(_index);
        if (_orderLeft.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_orderLeft, positioning), "Periphery: left order price verification failed");
        if (_orderRight.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_orderRight, positioning), "Periphery: right order price verification failed");
        positioning.openPosition(_orderLeft, _signatureLeft, _orderRight, _signatureRight, liquidator);
    }

    function _requireVolmexPerpPeripheryAdmin() internal view {
        require(hasRole(VOLMEX_PERP_PERIPHERY, _msgSender()), "Periphery: Not admin");
    }

    function _requireVolmexPerpPeripheryRelayer() internal view {
        require(hasRole(RELAYER_MULTISIG, _msgSender()), "VolmexPerpPeriphery: Not relayer");
    }

    function _requireWhitelistedTrader(address trader) internal view {
        require(isTraderWhitelisted[trader], "Periphery: trader not whitelisted");
    }

    // Note for V2: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LibOrder.Order memory _limitOrder, IPositioning _positioning) private view returns (bool) {
        // Note for V2: Add check for round id, when Volmex Oracle updates functionality

        address positioningConfig = _positioning.getPositioningConfig();
        uint32 twInterval = IPositioningConfig(positioningConfig).getTwapInterval();

        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder, twInterval);

        if (_limitOrder.orderType == LibOrder.STOP_LOSS_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                // Sell Stop Limit Order Trigger Price Not Matched
                return triggeredPrice <= _limitOrder.limitOrderTriggerPrice;
            } else {
                // Buy Stop Limit Order Trigger Price Not Matched
                return triggeredPrice >= _limitOrder.limitOrderTriggerPrice;
            }
        } else if (_limitOrder.orderType == LibOrder.TAKE_PROFIT_LIMIT_ORDER) {
            if (_limitOrder.isShort) {
                // Sell Take-profit Limit Order Trigger Price Not Matched
                return triggeredPrice >= _limitOrder.limitOrderTriggerPrice;
            } else {
                // Buy Take-profit Limit Order Trigger Price Not Matched
                return triggeredPrice <= _limitOrder.limitOrderTriggerPrice;
            }
        }
        return false;
    }

    function _getBaseTokenPrice(LibOrder.Order memory _order, uint256 _twInterval) private view returns (uint256 price) {
        address makeAsset = _order.makeAsset.virtualToken;
        address takeAsset = _order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        // TODO: change to index, mark and mark's latest price
        uint256 _index = markPriceOracle.indexByBaseToken(baseToken);
        if (_order.twapType == LibOrder.MARK_TWAP) {
            price = markPriceOracle.getCumulativePrice(_twInterval, _index);
        } else if (_order.twapType == LibOrder.INDEX_TWAP) {
            price = indexPriceOracle.getCumulativePrice(_twInterval, _index);
        } else {
            price = markPriceOracle.getCumulativePrice(60, _index);
        }
    }
}
