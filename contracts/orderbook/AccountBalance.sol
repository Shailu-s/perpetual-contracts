// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

import { LibAccountMarket } from "../libs/LibAccountMarket.sol";
import { LibSafeCastUint } from "../libs/LibSafeCastUint.sol";
import { LibSafeCastInt } from "../libs/LibSafeCastInt.sol";
import { LibPerpMath } from "../libs/LibPerpMath.sol";
import { LibFullMath } from "../libs/LibFullMath.sol";

import { IPositioningConfig } from "../interfaces/IPositioningConfig.sol";
import { IVolmexBaseToken } from "../interfaces/IVolmexBaseToken.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { IMatchingEngine } from "../interfaces/IMatchingEngine.sol";
import { IVirtualToken } from "../interfaces/IVirtualToken.sol";

import { AccountBalanceStorageV1 } from "../storage/AccountBalanceStorage.sol";
import { PositioningCallee } from "../helpers/PositioningCallee.sol";
import { BlockContext } from "../helpers/BlockContext.sol";

// never inherit any new stateful contract. never change the orders of parent stateful contracts
contract AccountBalance is IAccountBalance, BlockContext, PositioningCallee, AccountBalanceStorageV1 {
    using AddressUpgradeable for address;
    using LibSafeCastUint for uint256;
    using LibSafeCastInt for int256;
    using LibPerpMath for uint256;
    using LibPerpMath for int256;
    using LibPerpMath for uint160;
    using LibAccountMarket for LibAccountMarket.Info;

    function initialize(
        address positioningConfigArg,
        address[4] calldata volmexBaseTokenArgs,
        uint256[2] calldata chainlinkBaseTokenIndexArgs,
        IMatchingEngine matchingEngineArg,
        address adminArg
    ) external initializer {
        // IPositioningConfig address is not contract
        require(positioningConfigArg.isContract(), "AB_VPMMCNC");

        __PositioningCallee_init();

        _positioningConfig = positioningConfigArg;
        _smInterval = 28800;
        _smIntervalLiquidation = 3600;
        for (uint256 index; index < 2; index++) {
            _underlyingPriceIndexes[volmexBaseTokenArgs[index]] = index;
            _underlyingPriceIndexes[volmexBaseTokenArgs[index+2]] = chainlinkBaseTokenIndexArgs[index];
        }
        matchingEngine = matchingEngineArg;
        sigmaVolmexIvs[0] = 12600; // 0.0126
        sigmaVolmexIvs[1] = 13300; // 0.0133
        sigmaVolmexIvs[chainlinkBaseTokenIndexArgs[0]] = 9600; // 0.0096
        sigmaVolmexIvs[chainlinkBaseTokenIndexArgs[1]] = 7400; // 0.0074
        minTimeBound = 600; // 10 minutes
        _grantRole(SM_INTERVAL_ROLE, positioningConfigArg);
        _grantRole(ACCOUNT_BALANCE_ADMIN, _msgSender());
        _grantRole(SIGMA_IV_ROLE, adminArg);
    }

    function grantSettleRealizedPnlRole(address account) external {
        _requireAccountBalanceAdmin();
        _grantRole(CAN_SETTLE_REALIZED_PNL, account);
    }

    function grantAddUnderlyingIndexRole(address account) external {
        _requireAccountBalanceAdmin();
        _grantRole(ADD_UNDERLYING_INDEX, account);
    }
 
    function grantSigmaVivRole(address account) external {
        _requireAccountBalanceAdmin();
        _grantRole(SIGMA_IV_ROLE, account);
    }

    function setUnderlyingPriceIndex(address volmexBaseToken, uint256 underlyingIndex) external {
        _requireAddUnderlyingIndexRole();
        _underlyingPriceIndexes[volmexBaseToken] = underlyingIndex;
        emit UnderlyingPriceIndexSet(underlyingIndex, volmexBaseToken);
    }

    function setSmInterval(uint256 smInterval) external virtual {
        _requireSmIntervalRole();
        _smInterval = smInterval;
    }

    function setSmIntervalLiquidation(uint256 smIntervalLiquidation) external virtual {
        _requireSmIntervalRole();
        _smIntervalLiquidation = smIntervalLiquidation;
    }

    function setMinTimeBound(uint256 minTimeBoundArg) external virtual {
        _requireMinTimeBoundRole();
        require(minTimeBoundArg > 300, "AB_NS5"); // not smaller than 5 mins
        minTimeBound = minTimeBoundArg;
    }

    function setSigmaViv(uint256 _baseTokenIndex,uint256 _sigmaViv) external virtual {
        _requireSigmaIvRole();
        require(_sigmaViv > 0, "AccountBalance: not zero");
        sigmaVolmexIvs[_baseTokenIndex] = _sigmaViv;
    }
    
    /// @inheritdoc IAccountBalance
    function modifyOwedRealizedPnl(
        address trader,
        int256 amount,
        address baseToken
    ) external override {
        _requireOnlyPositioning();
        _modifyOwedRealizedPnl(trader, amount, baseToken);
    }

    function updateTwPremiumGrowthGlobal(
        address trader,
        address baseToken,
        int256 lastTwPremiumGrowthGlobal
    ) external override {
        _requireOnlyPositioning();
        _accountMarketMap[trader][baseToken].lastTwPremiumGrowthGlobal = lastTwPremiumGrowthGlobal;
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
        // AB_MNE: markets number exceeds
        require(tokensStorage.length + 1 <= IPositioningConfig(_positioningConfig).getMaxMarketsPerAccount(), "AB_MNE");
        tokensStorage.push(baseToken);
    }

    /// @inheritdoc IAccountBalance
    function settleBalanceAndDeregister(
        address trader,
        address baseToken,
        int256 takerBase,
        int256 takerQuote,
        int256 realizedPnl,
        int256 fee
    ) external override returns (int256 positionSize) {
        _requireOnlyPositioning();
        (positionSize, ) = _modifyTakerBalance(trader, baseToken, takerBase, takerQuote);
        if (fee != 0) {
            _modifyOwedRealizedPnl(trader, fee, baseToken);
        }
        if (realizedPnl != 0) {
            // @audit should merge _addOwedRealizedPnl and settleQuoteToOwedRealizedPnl in some way.
            // PnlRealized will be emitted three times when removing trader's liquidity
            _settleQuoteToOwedRealizedPnl(trader, baseToken, realizedPnl);
        }
        _deregisterBaseToken(trader, baseToken);
    }

    function updateSigmaVolmexIvs(uint256[] memory _indexes, uint256[] memory _sigmaVivs) external virtual {
        _requireSigmaIvRole();
        uint256 totalIndex = _indexes.length;
        for (uint256 index; index < totalIndex; ++index) {
            require(_sigmaVivs[index] > 0, "AccountBalance: not zero");
            sigmaVolmexIvs[_indexes[index]] = _sigmaVivs[index];
        }
        emit SigmaVolmexIvsUpdated(_indexes, _sigmaVivs);
    }

    /// @inheritdoc IAccountBalance
    function getPositioningConfig() external view override returns (address) {
        return _positioningConfig;
    }

    /// @inheritdoc IAccountBalance
    function getBaseTokens(address trader) external view override returns (address[] memory) {
        return _baseTokensMap[trader];
    }

    /// @inheritdoc IAccountBalance
    function getAccountInfo(address trader, address baseToken) external view override returns (LibAccountMarket.Info memory) {
        return _accountMarketMap[trader][baseToken];
    }

    /// @inheritdoc IAccountBalance
    function getLiquidatablePositionSize(
        address trader,
        address baseToken,
        int256 accountValue
    ) public view override returns (int256) {
        int256 marginRequirement = getMarginRequirementForLiquidation(trader);
        int256 positionSize = getPositionSize(trader, baseToken);

        // No liquidatable position
        if (accountValue >= marginRequirement || positionSize == 0) {
            return 0;
        }

        uint256 positionValueAbs = getTotalPositionValue(trader, baseToken, _smIntervalLiquidation).abs();
        // Liquidator can only take over partial position if margin ratio is ≥ 3.125% (aka the half of mmRatio).
        // If margin ratio < 3.125%, liquidator can take over the entire position.
        //
        // threshold = mmRatio / 2 = 3.125%
        // if marginRatio >= threshold, then
        //    maxLiquidateRatio = MIN(1, 0.5 * totalAbsPositionValue / absPositionValue)
        // if marginRatio < threshold, then
        //    maxLiquidateRatio = 1
        uint256 maxLiquidateRatio = 1e6; // 100%
        if (accountValue >= marginRequirement / 2) {
            // maxLiquidateRatio = getTotalAbsPositionValue / ( getTotalPositionValueInMarket.abs * 2 )
            maxLiquidateRatio = LibFullMath.mulDiv(getTotalAbsPositionValue(trader), 1e6, positionValueAbs * 2);
            if (maxLiquidateRatio > 1e6) {
                maxLiquidateRatio = 1e6;
            }
        }
        return positionSize.mulRatio(maxLiquidateRatio.toInt256());
    }

    // @inheritdoc IAccountBalance
    function getOpenNotional(address trader, address baseToken) external view override returns (int256) {
        return _accountMarketMap[trader][baseToken].openNotional;
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
            int256 baseBalance = _accountMarketMap[trader][baseToken].positionSize;
            int256 baseDebtValue;
            // baseDebt = baseBalance when it's negative
            if (baseBalance < 0) {
                // baseDebtValue = baseDebt * indexPrice
                // baseDebtValue = baseBalance.mulDiv(_getIndexPrice(baseToken).toInt256(), 1e18);
                uint256 indexPrice = _getIndexPrice(baseToken, _smIntervalLiquidation);
                require(indexPrice != 0, "AccountBalance: zero index price");
                baseDebtValue = (baseBalance * indexPrice.toInt256()) / _ORACLE_BASE;
            }
            totalBaseDebtValue = totalBaseDebtValue + baseDebtValue;
            // we can't calculate totalQuoteDebtValue until we have totalQuoteBalance
            totalQuoteBalance = totalQuoteBalance + _accountMarketMap[trader][baseToken].openNotional;
        }
        int256 totalQuoteDebtValue = totalQuoteBalance >= int256(0) ? int256(0) : totalQuoteBalance;
        // both values are negative due to the above condition checks
        return (totalQuoteDebtValue + totalBaseDebtValue).abs();
    }

    /// @inheritdoc IAccountBalance
    function getPnlAndPendingFee(address trader) public view virtual override returns (int256, int256) {
        int256 totalPositionValue;
        uint256 tokenLen = _baseTokensMap[trader].length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = _baseTokensMap[trader][i];
            totalPositionValue = totalPositionValue + getTotalPositionValue(trader, baseToken, _smIntervalLiquidation);
        }

        int256 netQuoteBalance = _getNetQuoteBalance(trader);

        int256 unrealizedPnl = totalPositionValue + netQuoteBalance;

        return (_owedRealizedPnlMap[trader], unrealizedPnl);
    }

    /// @dev this function is used to fetch index price of base token
    function getIndexPrice(address baseToken, uint256 twInterval) external view returns (uint256 indexPrice) {
        indexPrice = _getIndexPrice(baseToken, twInterval);
    }

    /// @dev This function checks if account of trader is eligible for liquidation
    function isAccountLiquidatable(
        address trader,
        address baseToken,
        uint256 minOrderSize,
        int256 accountValue,
        int256 freeCollateralByRatio
    ) external view returns (bool isLiquidatable) {
        (uint256 timeToWait, bool isLiquidationPossible) = getLiquidationTimeToWait(trader, baseToken, accountValue, minOrderSize, freeCollateralByRatio);
        if(!isLiquidationPossible) return false;
        if (nextLiquidationTime[trader] + timeToWait > block.timestamp) return false;
        return accountValue < getMarginRequirementForLiquidation(trader);
    }

    /// @inheritdoc IAccountBalance
    function getMarginRequirementForLiquidation(address trader) public view override returns (int256) {
        return getTotalAbsPositionValue(trader).mulRatio(IPositioningConfig(_positioningConfig).getMmRatio()).toInt256();
    }

    /// @inheritdoc IAccountBalance
    function getPositionSize(address trader, address baseToken) public view override returns (int256) {
        int256 positionSize = _accountMarketMap[trader][baseToken].positionSize;
        return positionSize.abs() < _DUST ? int256(0) : positionSize;
    }

    /// @inheritdoc IAccountBalance
    function getTotalPositionValue(
        address trader,
        address baseToken,
        uint256 twInterval
    ) public view override returns (int256) {
        int256 positionSize = getPositionSize(trader, baseToken);
        if (positionSize == 0) return 0;

        uint256 indexTwap = _getIndexPrice(baseToken, twInterval);
        require(indexTwap != 0, "AccountBalance: zero index twap");
        // both positionSize & indexTwap are in 10^18 already
        // overflow inspection: 
        // only overflow when position value in USD(18 decimals) > 2^255 / 10^18
        return (positionSize * indexTwap.toInt256()) / _ORACLE_BASE;
    }

    /// @inheritdoc IAccountBalance
    function getTotalAbsPositionValue(address trader) public view override returns (uint256) {
        address[] memory tokens = _baseTokensMap[trader];
        uint256 totalPositionValue;
        uint256 tokenLen = tokens.length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = tokens[i];
            // will not use negative value in this case
            uint256 positionValue = getTotalPositionValue(trader, baseToken, _smIntervalLiquidation).abs();
            totalPositionValue = totalPositionValue + positionValue;
        }
        return totalPositionValue;
    }

    function getTraderBaseTokens(address trader) public view override returns (address[] memory) {
        return _baseTokensMap[trader];
    }

    function getNLiquidate(
        uint256 liquidatablePositionSize,
        uint256 minOrderSize,
        uint256 maxOrderSize
    ) public view returns (uint256 nLiquidate) {
        nLiquidate = (liquidatablePositionSize.umin((_getFuzzyMaxOrderSize(minOrderSize, maxOrderSize))).umax(minOrderSize));
    }

    function getLiquidationTimeToWait(
        address trader,
        address baseToken,
        int256 accountValue,
        uint256 minOrderSize,
        int256 freeCollateralByRatio
    ) public view returns (uint256 timeToWait, bool isLiquidationPossible) {
        uint256 maxOrderSize = matchingEngine.getMaxOrderSizeOverTime(baseToken);
        int256 idealAmountToLiquidate = getLiquidatablePositionSize(trader, baseToken, accountValue);
        if(idealAmountToLiquidate.abs() > 0) { // liquidate amount should be gt zero
            isLiquidationPossible = true;
        } else {
            return (0, false);
        }

        uint256 totalPositionNotional = getTotalAbsPositionValue(trader);
        uint256 nLiquidate = getNLiquidate(idealAmountToLiquidate.abs(), minOrderSize, maxOrderSize);
        uint256 sigmaVolmexIv = (sigmaVolmexIvs[_underlyingPriceIndexes[baseToken]]);
        uint256 maxTimeBound = (((freeCollateralByRatio.abs() * _SIGMA_IV_BASE * 1e18) / (6 * sigmaVolmexIv * totalPositionNotional))**2) / 1e36;
        timeToWait = maxTimeBound > minTimeBound ? (nLiquidate * maxTimeBound) / idealAmountToLiquidate.abs() : 0;
    }

    function checkAndUpdateLiquidationTimeToWait(
        address trader,
        address baseToken,
        int256 accountValue,
        uint256 minOrderSize,
        int256 freeCollateralByRatio
    ) external {
        _requireOnlyPositioning();
        (uint256 timeToWait, bool isLiquidationPossible) = getLiquidationTimeToWait(trader, baseToken, accountValue, minOrderSize, freeCollateralByRatio);
        require(isLiquidationPossible, "AB_LNZ");
        if (timeToWait > 0) require(nextLiquidationTime[trader] <= block.timestamp, "AB_ELT"); // early liquidation triggered
        nextLiquidationTime[trader] = block.timestamp + timeToWait;
        if (accountValue < 0) emit TraderBadDebt(trader, accountValue);
        if (timeToWait == 0) emit ZeroMaxTimeBound(trader, timeToWait);
        emit TraderNextLiquidationUpdated(trader, baseToken, nextLiquidationTime[trader]);
    }

    function _modifyTakerBalance(
        address trader,
        address baseToken,
        int256 base,
        int256 quote
    ) internal returns (int256, int256) {
        LibAccountMarket.Info storage accountInfo = _accountMarketMap[trader][baseToken];
        accountInfo.positionSize = accountInfo.positionSize + base;
        accountInfo.openNotional = accountInfo.openNotional + quote;
        if (accountInfo.positionSize.abs() >= _DUST || accountInfo.openNotional.abs() >= _DUST) {
            return (accountInfo.positionSize, accountInfo.openNotional);
        }
        return (0, 0);
    }

    function _modifyOwedRealizedPnl(
        address trader,
        int256 amount,
        address baseToken
    ) internal {
        if (amount != 0) {
            _owedRealizedPnlMap[trader] = _owedRealizedPnlMap[trader] + amount;
            emit PnlRealized(trader, baseToken, amount);
        }
    }

    function _settleQuoteToOwedRealizedPnl(
        address trader,
        address baseToken,
        int256 amount
    ) internal {
        LibAccountMarket.Info storage accountInfo = _accountMarketMap[trader][baseToken];
        accountInfo.openNotional = accountInfo.openNotional - amount;
        _modifyOwedRealizedPnl(trader, amount, baseToken);
    }

    /// @dev this function is expensive
    function _deregisterBaseToken(address trader, address baseToken) internal {
        LibAccountMarket.Info memory info = _accountMarketMap[trader][baseToken];
        if (info.positionSize.abs() >= _DUST || info.openNotional.abs() >= _DUST) {
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

    function _getIndexPrice(address baseToken, uint256 twInterval) internal view returns (uint256) {
        uint256 baseTokenIndex = _underlyingPriceIndexes[baseToken];
        return IVolmexBaseToken(baseToken).getIndexPrice(baseTokenIndex, twInterval);
    }

    /// @return netQuoteBalance = quote.balance
    function _getNetQuoteBalance(address trader) internal view returns (int256) {
        int256 totalTakerQuoteBalance;
        uint256 tokenLen = _baseTokensMap[trader].length;
        for (uint256 i = 0; i < tokenLen; i++) {
            address baseToken = _baseTokensMap[trader][i];
            totalTakerQuoteBalance = totalTakerQuoteBalance + (_accountMarketMap[trader][baseToken].openNotional);
        }
        return (totalTakerQuoteBalance);
    }

    function _getFuzzyMaxOrderSize(uint256 minOrderSize, uint256 maxOrderSize) internal view returns (uint256 fuzzyMaxOrderSize) {
        uint128 uint128Max = type(uint128).max;
        uint256 pseudoRandomNumber128Bits = uint128(uint128Max & uint256(keccak256(abi.encodePacked(block.difficulty, blockhash(block.number - 1), block.timestamp))));
        uint256 pseudoRandomOrderSize = (maxOrderSize * (((pseudoRandomNumber128Bits * 2 * 10**17) / uint128Max) + 8 * 10**17)) / 10**18;

        fuzzyMaxOrderSize = minOrderSize.umax(pseudoRandomOrderSize);
    }

    function _requireAccountBalanceAdmin() internal view {
        require(hasRole(ACCOUNT_BALANCE_ADMIN, _msgSender()), "AccountBalance: Not admin");
    }

    function _requireSmIntervalRole() internal view {
        require(hasRole(SM_INTERVAL_ROLE, _msgSender()), "AccountBalance: Not sm interval role");
    }

    function _requireSigmaIvRole() internal view {
        require(hasRole(SIGMA_IV_ROLE, _msgSender()), "AccountBalance: Not sigma IV role");
    }

    function _requireMinTimeBoundRole() internal view {
        require(hasRole(SIGMA_IV_ROLE, _msgSender()), "AccountBalance: Not sigma IV role");
    }

    function _requireAddUnderlyingIndexRole() internal view {
        require(hasRole(ADD_UNDERLYING_INDEX, _msgSender()), "AccountBalance: Not add underlying index role");
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
