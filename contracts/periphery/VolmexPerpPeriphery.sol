// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { SafeERC20Upgradeable } from "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";

import { IVolmexPerpPeriphery, IERC20Upgradeable, IVirtualToken } from "../interfaces/IVolmexPerpPeriphery.sol";
import { IPerpetualOracle } from "../interfaces/IPerpetualOracle.sol";
import { IVaultController } from "../interfaces/IVaultController.sol";
import { IVolmexPerpView } from "../interfaces/IVolmexPerpView.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";

import { LibOrder } from "../libs/LibOrder.sol";
contract VolmexPerpPeriphery is AccessControlUpgradeable, IVolmexPerpPeriphery {
    using SafeERC20Upgradeable for IERC20Upgradeable;

    // perp periphery role
    bytes32 public constant VOLMEX_PERP_PERIPHERY = keccak256("VOLMEX_PERP_PERIPHERY");
    // role of relayer to execute open position
    bytes32 public constant RELAYER_MULTISIG = keccak256("RELAYER_MULTISIG");
    // role for whitelisting traders
    bytes32 public constant TRADER_WHITELISTER = keccak256("TRADER_WHITELISTER");
    // role for whitelisting traders
    bytes32 public constant ACCOUNT_BLACKLISTER = keccak256("ACCOUNT_BLACKLISTER");

    // Store the whitelist Vaults
    mapping(address => bool) private _isVaultWhitelist;

    // Store the whitelist traders
    mapping(address => bool) public isTraderWhitelisted;
    
    // Store the blacklisted address
    mapping(address => bool) public isAccountBlacklisted;

    // Boolean flag to enable / disable whitelisted traders
    bool public isTraderWhitelistEnabled;

    // Used to fetch market and index prices
    IPerpetualOracle public perpetualOracle;
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
    function initialize(IVolmexPerpView _perpView, IPerpetualOracle _perpetualOracle, address[2] memory _vaults, address _owner, address _relayer) external initializer {
        require(_owner != address(0), "VolmexPerpPeriphery: Admin can't be address(0)");
        require(_relayer != address(0), "VolmexPerpPeriphery: Relayer can't be address(0)");
        require(address(_perpView) != address(0), "VolmexPerpPeriphery: zero address");
        perpetualOracle = _perpetualOracle;
        perpView = _perpView;

        for (uint256 i = 0; i < 2; i++) {
            _isVaultWhitelist[_vaults[i]] = true;
        }
        isTraderWhitelistEnabled = true;
        _grantRole(VOLMEX_PERP_PERIPHERY, _owner);
        _grantRole(TRADER_WHITELISTER, _owner);
        _setRoleAdmin(TRADER_WHITELISTER, TRADER_WHITELISTER);
        _grantRole(ACCOUNT_BLACKLISTER, _owner);
        _setRoleAdmin(ACCOUNT_BLACKLISTER, ACCOUNT_BLACKLISTER);
        _grantRole(RELAYER_MULTISIG, _relayer);
        _setRoleAdmin(RELAYER_MULTISIG, RELAYER_MULTISIG);
    }

    function setPerpetualOracle(IPerpetualOracle _perpetualOracle) external {
        _requireVolmexPerpPeripheryAdmin();
        perpetualOracle = _perpetualOracle;
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
        _requireTraderWhitelister();
        isTraderWhitelisted[_trader] = _isWhitelist;
        emit TraderWhitelisted(_trader, _isWhitelist);
    }

    function blacklistAccounts(address[] calldata _accounts, bool[] calldata _isBlacklist) external {
        _requireAccountBlacklisterRole();
        require(_accounts.length == _isBlacklist.length,"Periphery: mismatch array lengths");
        uint256 totalAccounts = _accounts.length;
        for (uint256 index; index < totalAccounts; ++index) {
            isAccountBlacklisted[_accounts[index]] = _isBlacklist[index];
        }
    }

    function depositToVault(uint256 _index, address _token, uint256 _amount) external {
        _requireAccountNotBlacklisted(_msgSender());
        IVaultController vaultController = perpView.vaultControllers(_index);
        vaultController.deposit(IVolmexPerpPeriphery(address(this)), _token, _msgSender(), _amount);
    }

    function withdrawFromVault(uint256 _index, address _token, address _to, uint256 _amount) external {
        _requireAccountNotBlacklisted(_to);
        IVaultController vaultController = perpView.vaultControllers(_index);
        vaultController.withdraw(_token, _to, _amount);
    }

    function openPosition(
        uint256 _index,
        LibOrder.Order memory _makerOrder,
        bytes memory _signatureMaker,
        LibOrder.Order memory _takerOrder,
        bytes memory _signatureTaker,
        bytes memory liquidator
    ) external {
        _requireVolmexPerpPeripheryRelayer();
        _requireAccountNotBlacklisted(_makerOrder.trader);
        _requireAccountNotBlacklisted(_takerOrder.trader);
        if (isTraderWhitelistEnabled) {
            _requireWhitelistedTrader(_makerOrder.trader);
            _requireWhitelistedTrader(_takerOrder.trader);
        }
        _openPosition(_index, _makerOrder, _signatureMaker, _takerOrder, _signatureTaker, liquidator);
    }

    function batchOpenPosition(
        uint256 _index,
        LibOrder.Order[] memory _makerOrders,
        bytes[] memory _signaturesMaker,
        LibOrder.Order[] memory _takerOrders,
        bytes[] memory _signaturesTaker,
        bytes memory liquidator
    ) external {
        require(_makerOrders.length == _takerOrders.length, "Periphery: mismatch orders");
        _requireVolmexPerpPeripheryRelayer();

        uint256 ordersLength = _makerOrders.length;
        bool _isTraderWhitelistEnabled = isTraderWhitelistEnabled;
        if (_isTraderWhitelistEnabled) {
            for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
                _requireWhitelistedTrader(_makerOrders[orderIndex].trader);
                _requireWhitelistedTrader(_takerOrders[orderIndex].trader);
            }
        }

        for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            _openPosition(_index, _makerOrders[orderIndex], _signaturesMaker[orderIndex], _takerOrders[orderIndex], _signaturesTaker[orderIndex], liquidator);
        }
    }

    function transferToVault(IERC20Upgradeable _token, address _from, uint256 _amount) external {
        address caller = _msgSender();
        _requireAccountNotBlacklisted(_from);
        require(_isVaultWhitelist[caller], "Periphery: vault not whitelisted");
        _token.safeTransferFrom(_from, caller, _amount);
    }

    function batchOrderValidate(LibOrder.Order[] memory order, uint256 _index) external view returns (bool[] memory) {
        uint256 ordersLength = order.length;
        bool[] memory _result = new bool[](ordersLength);
        for (uint256 orderIndex = 0; orderIndex < ordersLength; orderIndex++) {
            _result[orderIndex] = getTraderOrderValidate(_index, order[orderIndex]);
        }
        return _result;
    }

    function getTraderOrderValidate(uint256 _index, LibOrder.Order memory _order) public view returns (bool) {
        if (!isTraderWhitelisted[_order.trader]) return false;
        IPositioning positioning = perpView.positionings(_index);
        try positioning.getOrderValidate(_order) {
            return true;
        } catch {
            return false;
        }
    }

    /**
        Internal view functions
     */

    function _openPosition(
        uint256 _index,
        LibOrder.Order memory _makerOrder,
        bytes memory _signatureMaker,
        LibOrder.Order memory _takerOrder,
        bytes memory _signatureTaker,
        bytes memory liquidator
    ) internal {
        if (_makerOrder.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_makerOrder), "Periphery: left order price verification failed");
        if (_takerOrder.orderType != LibOrder.ORDER) require(_verifyTriggerPrice(_takerOrder), "Periphery: right order price verification failed");
        IPositioning positioning = perpView.positionings(_index);
        positioning.openPosition(_makerOrder, _signatureMaker, _takerOrder, _signatureTaker, liquidator);
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

    function _requireAccountNotBlacklisted(address account) internal view {
        require(!isAccountBlacklisted[account], "Periphery: account blacklisted");
    }

    function _requireTraderWhitelister() internal view {
        require(hasRole(TRADER_WHITELISTER, _msgSender()), "VolmexPerpPeriphery: Not whitelister");
    }

    function _requireAccountBlacklisterRole() internal view {
        require(hasRole(ACCOUNT_BLACKLISTER, _msgSender()), "VolmexPerpPeriphery: Not blacklister");
    }

    // Note for V2: Change the logic to round id, if Volmex Oracle implements price by round id functionality
    function _verifyTriggerPrice(LibOrder.Order memory _limitOrder) private view returns (bool result) {
        // Note for V2: Add check for round id, when Volmex Oracle updates functionality
        uint256 triggeredPrice = _getBaseTokenPrice(_limitOrder);

        if (_checkLimitOrderType(_limitOrder.orderType, true)) {
            if (_limitOrder.isShort) {
                // Sell Stop Limit Order Trigger Price Not Matched
                result = triggeredPrice <= _limitOrder.limitOrderTriggerPrice;
            } else {
                // Buy Stop Limit Order Trigger Price Not Matched

                result = triggeredPrice >= _limitOrder.limitOrderTriggerPrice;
            }
        } else if (_checkLimitOrderType(_limitOrder.orderType, false)) {
            if (_limitOrder.isShort) {
                // Sell Take-profit Limit Order Trigger Price Not Matched
                result = triggeredPrice >= _limitOrder.limitOrderTriggerPrice;
            } else {
                // Buy Take-profit Limit Order Trigger Price Not Matched
                result = triggeredPrice <= _limitOrder.limitOrderTriggerPrice;
            }
        }
    }

    function _getBaseTokenPrice(LibOrder.Order memory _order) private view returns (uint256 price) {
        address makeAsset = _order.makeAsset.virtualToken;
        address takeAsset = _order.takeAsset.virtualToken;

        address baseToken = IVirtualToken(makeAsset).isBase() ? makeAsset : takeAsset;

        // TODO: change to index, mark and mark's latest price
        uint256 _index = perpetualOracle.indexByBaseToken(baseToken);
        if (_order.orderType == LibOrder.STOP_LOSS_MARK_PRICE || _order.orderType == LibOrder.TAKE_PROFIT_MARK_PRICE) {
            price = perpetualOracle.latestMarkPrice(_index);
        } else if (_order.orderType == LibOrder.STOP_LOSS_INDEX_PRICE || _order.orderType == LibOrder.TAKE_PROFIT_INDEX_PRICE) {
            price = perpetualOracle.latestIndexPrice(_index);
        } else {
            price = perpetualOracle.latestLastPrice(_index);
        }
    }

    function _checkLimitOrderType(bytes4 orderType, bool isStopLoss) private pure returns (bool) {
        if (isStopLoss) {
            return orderType == LibOrder.STOP_LOSS_INDEX_PRICE || orderType == LibOrder.STOP_LOSS_LAST_PRICE || orderType == LibOrder.STOP_LOSS_MARK_PRICE;
        } else {
            return orderType == LibOrder.TAKE_PROFIT_INDEX_PRICE || orderType == LibOrder.TAKE_PROFIT_LAST_PRICE || orderType == LibOrder.TAKE_PROFIT_MARK_PRICE;
        }
    }
}
