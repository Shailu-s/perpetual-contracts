// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.12;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ContextUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ContextUpgradeable.sol";

import { LibAccountMarket } from "../libs/LibAccountMarket.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";

import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IIndexPrice } from "../interfaces/IIndexPrice.sol";
import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

import { AccountBalanceStorageV1 } from "../storage/AccountBalanceStorage.sol";
import { BlockContext } from "../helpers/BlockContext.sol";
import { RoleManager } from "../helpers/RoleManager.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract AccountBalance is IAccountBalance, BlockContext, PositioningCallee, AccountBalanceStorageV1 {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibPerpMath for uint160;
    using LibAccountMarket for LibAccountMarket.Info;

    //
    // CONSTANT
    //

    uint256 internal constant _DUST = 10 wei;
    uint256 private constant _ORACLE_BASE = 100000000;


    //
    // EXTERNAL NON-VIEW
    //

    function initialize(address PositioningConfigArg) external initializer {
        // IPositioningConfig address is not contract
        require(PositioningConfigArg.isContract(), "AB_VPMMCNC");

        __PositioningCallee_init();

        _positioningConfig = PositioningConfigArg;
        _grantRole(ACCOUNT_BALANCE_ADMIN, _msgSender());
    }

    function setVault(address vaultArg) external {
        _requireAccountBalanceAdmin();
        // vault address is not contract
        require(vaultArg.isContract(), "AB_VNC");
        _vault = vaultArg;
        emit VaultChanged(vaultArg);
    }

    function grantSettleRealizedPnlRole(address account) external {
        _requireAccountBalanceAdmin();
        _grantRole(CAN_SETTLE_REALIZED_PNL, account);
    }

    /// @inheritdoc IAccountBalance
    function modifyTakerBalance(
        address trader,
        address baseToken,
        int256 base,
        int256 quote
    ) external override returns (int256, int256) {
        _requireOnlyPositioning();
        return _modifyTakerBalance(trader, baseToken, base, quote);
    }

    /// @inheritdoc IAccountBalance
    function modifyOwedRealizedPnl(address trader, int256 amount) external override {
        _requireOnlyPositioning();
        _modifyOwedRealizedPnl(trader, amount);
    }

    /// @inheritdoc IAccountBalance
    function settleQuoteToOwedRealizedPnl(
        address trader,
        address baseToken,
        int256 amount
    ) external override {
        _requireOnlyPositioning();
        _settleQuoteToOwedRealizedPnl(trader, baseToken, amount);
    }

    /// @inheritdoc IAccountBalance
    function settleOwedRealizedPnl(address trader) external override returns (int256) {
        // Account Balance: Not CAN_SETTLE_REALIZED_PNL
        require(hasRole(CAN_SETTLE_REALIZED_PNL, _msgSender()), "AccountBalance: Not role settle PNL");
        int256 owedRealizedPnl = _owedRealizedPnlMap[trader];
        _owedRealizedPnlMap[trader] = 0;

        return owedRealizedPnl;
    }

    /// @inheritdoc IAccountBalance
    function registerBaseToken(address trader, address baseToken) external override {
        _requireOnlyPositioning();
        require(IVirtualToken(baseToken).isBase(), "AccountBalance: not base token");
        address[] storage tokensStorage = _baseTokensMap[trader];
        if (_hasBaseToken(tokensStorage, baseToken)) {
            return;
        }
        require(tokensStorage.length + 1 <= IPositioningConfig(_positioningConfig).getMaxMarketsPerAccount(), "AB_MNE");

        tokensStorage.push(baseToken);
        // AB_MNE: markets number exceeds
    }

    /// @inheritdoc IAccountBalance
    function deregisterBaseToken(address trader, address baseToken) external override {
        _requireOnlyPositioning();
        _deregisterBaseToken(trader, baseToken);
    }

    /// @inheritdoc IAccountBalance
    function updateTwPremiumGrowthGlobal(
        address trader,
        address baseToken,
        int256 lastTwPremiumGrowthGlobal
    ) external override {
        _requireOnlyPositioning();
        _accountMarketMap[trader][baseToken].lastTwPremiumGrowthGlobal = lastTwPremiumGrowthGlobal;
    }

    //
    // EXTERNAL VIEW
    //

    /// @inheritdoc IAccountBalance
    function getPositioningConfig() external view override returns (address) {
        return _positioningConfig;
    }

    /// @inheritdoc IAccountBalance
    function getVault() external view override returns (address) {
        return _vault;
    }

    /// @inheritdoc IAccountBalance
    function getBaseTokens(address trader) external view override returns (address[] memory) {
        return _baseTokensMap[trader];
    }

    /// @inheritdoc IAccountBalance
    function getAccountInfo(address trader, address baseToken)
        external
        view
        override
        returns (LibAccountMarket.Info memory)
    {
        return _accountMarketMap[trader][baseToken];
    }

    // @inheritdoc IAccountBalance
    function getTakerOpenNotional(address trader, address baseToken) external view override returns (int256) {
        return _accountMarketMap[trader][baseToken].takerOpenNotional;
    }

    /**
    Remove debt things here too
     */
    /// @inheritdoc IAccountBalance
    function getTotalDebtValue(address trader) external view override returns (uint256) {
        int256 totalQuoteBalance;
        int256 totalBaseDebtValue;
        uint256 tokenLen = _baseTokensMap[trader].length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = _baseTokensMap[trader][i];
            int256 baseBalance = _accountMarketMap[trader][baseToken].takerPositionSize;
            int256 baseDebtValue;
            // baseDebt = baseBalance when it's negative
            if (baseBalance < 0) {
                // baseDebtValue = baseDebt * indexPrice
                //TODOCHANGE: decimal checks for index price
                // baseDebtValue = baseBalance.mulDiv(_getIndexPrice(baseToken).toInt256(), 1e18);
                baseDebtValue = baseBalance * _getIndexPrice(baseToken).toInt256();
            }
            totalBaseDebtValue = totalBaseDebtValue + baseDebtValue;
     
            // we can't calculate totalQuoteDebtValue until we have totalQuoteBalance
            totalQuoteBalance = totalQuoteBalance + _accountMarketMap[trader][baseToken].takerOpenNotional;
        }
        int256 totalQuoteDebtValue = totalQuoteBalance >= int256(0) ? int256(0) : totalQuoteBalance;

        // both values are negative due to the above condition checks
        return (totalQuoteDebtValue + totalBaseDebtValue).abs();
    }

    /// @inheritdoc IAccountBalance
    function getMarginRequirementForLiquidation(address trader) external view override returns (int256) {
        return
            getTotalAbsPositionValue(trader).mulRatio(IPositioningConfig(_positioningConfig).getMmRatio()).toInt256();
    }

    /// @inheritdoc IAccountBalance
    function getPnlAndPendingFee(address trader) external view virtual override returns (int256, int256) {
        int256 totalPositionValue;
        uint256 tokenLen = _baseTokensMap[trader].length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = _baseTokensMap[trader][i];
            totalPositionValue = totalPositionValue + getTotalPositionValue(trader, baseToken);
        }

        int256 netQuoteBalance = _getNetQuoteBalance(trader);

        int256 unrealizedPnl = totalPositionValue + netQuoteBalance;
        
        return (_owedRealizedPnlMap[trader], unrealizedPnl);
    }

    //
    // PUBLIC VIEW
    //

    /// @inheritdoc IAccountBalance
    function getTakerPositionSize(address trader, address baseToken) public view override returns (int256) {
        int256 positionSize = _accountMarketMap[trader][baseToken].takerPositionSize;
        return positionSize.abs() < _DUST ? int256(0) : positionSize;
    }

    /// @inheritdoc IAccountBalance
    function getTotalPositionValue(address trader, address baseToken) public view override returns (int256) {
        int256 positionSize = getTakerPositionSize(trader, baseToken);
        if (positionSize == 0) return 0;

        uint256 indexTwap = _getIndexPrice(baseToken);
        // both positionSize & indexTwap are in 10^18 already
        // overflow inspection:
        // only overflow when position value in USD(18 decimals) > 2^255 / 10^18
        // TODOCHANGE: Decimal calculation for indexTwap is not as same decimal as Position size
        // Todo: Should divide by ORACLE_BASE here
        return positionSize * indexTwap.toInt256();
    }

    /// @inheritdoc IAccountBalance
    function getTotalAbsPositionValue(address trader) public view override returns (uint256) {
        address[] memory tokens = _baseTokensMap[trader];
        uint256 totalPositionValue;
        uint256 tokenLen = tokens.length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = tokens[i];
            // will not use negative value in this case
            uint256 positionValue = getTotalPositionValue(trader, baseToken).abs();
            totalPositionValue = totalPositionValue + positionValue;
        }
        return totalPositionValue;
    }

    //
    // INTERNAL NON-VIEW
    //

    function _modifyTakerBalance(
        address trader,
        address baseToken,
        int256 base,
        int256 quote
    ) internal returns (int256, int256) {
        LibAccountMarket.Info storage accountInfo = _accountMarketMap[trader][baseToken];
        accountInfo.takerPositionSize = accountInfo.takerPositionSize + base;
        accountInfo.takerOpenNotional = accountInfo.takerOpenNotional + quote;
        return (accountInfo.takerPositionSize, accountInfo.takerOpenNotional);
    }

    function _modifyOwedRealizedPnl(address trader, int256 amount) internal {
        if (amount != 0) {
            _owedRealizedPnlMap[trader] = _owedRealizedPnlMap[trader] + amount;
            emit PnlRealized(trader, amount);
        }
    }

    function _settleQuoteToOwedRealizedPnl(
        address trader,
        address baseToken,
        int256 amount
    ) internal {
        LibAccountMarket.Info storage accountInfo = _accountMarketMap[trader][baseToken];
        accountInfo.takerOpenNotional = accountInfo.takerOpenNotional - amount;
        _modifyOwedRealizedPnl(trader, amount);
    }

    /// @dev this function is expensive
    function _deregisterBaseToken(address trader, address baseToken) internal {
        LibAccountMarket.Info memory info = _accountMarketMap[trader][baseToken];
        if (info.takerPositionSize.abs() >= _DUST || info.takerOpenNotional.abs() >= _DUST) {
            return;
        }

        delete _accountMarketMap[trader][baseToken];

        address[] storage tokensStorage = _baseTokensMap[trader];
        uint256 tokenLen = tokensStorage.length;
        for (uint256 i; i < tokenLen; i++) {
            if (tokensStorage[i] == baseToken) {
                // if the target to be removed is the last one, pop it directly;
                // else, replace it with the last one and pop the last one instead
                if (i != tokenLen - 1) {
                    tokensStorage[i] = tokensStorage[tokenLen - 1];
                }
                tokensStorage.pop();
                break;
            }
        }
    }

    //
    // INTERNAL VIEW
    //

    function _getIndexPrice(address baseToken) internal view returns (uint256) {
        // Todo: Multiply first then divide. Remove division from here
        return IIndexPrice(baseToken).getIndexPrice(IPositioningConfig(_positioningConfig).getTwapInterval()) / _ORACLE_BASE ;
    }

    /// @return netQuoteBalance = quote.balance
    function _getNetQuoteBalance(address trader) internal view returns (int256 ) {
        int256 totalTakerQuoteBalance;
        uint256 tokenLen = _baseTokensMap[trader].length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = _baseTokensMap[trader][i];
            totalTakerQuoteBalance = totalTakerQuoteBalance + (_accountMarketMap[trader][baseToken].takerOpenNotional);
        }

        return (totalTakerQuoteBalance);
    }

    function _requireAccountBalanceAdmin() internal view {
        require(hasRole(ACCOUNT_BALANCE_ADMIN, _msgSender()), "AccountBalance: Not admin");
    }

    function _hasBaseToken(address[] memory baseTokens, address baseToken) internal pure returns (bool) {
        for (uint256 i = 0; i < baseTokens.length; i++) {
            if (baseTokens[i] == baseToken) {
                return true;
            }
        }
        return false;
    }
}
