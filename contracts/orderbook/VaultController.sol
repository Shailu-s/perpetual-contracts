// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;
import { AddressUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import { SafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import { SignedSafeMathUpgradeable } from "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { BaseRelayRecipient } from "../gsn/BaseRelayRecipient.sol";
import { OwnerPausable } from "../helpers/OwnerPausable.sol";
import { IERC20Metadata } from "../interfaces/IERC20Metadata.sol";
import { VaultControllerStorage } from "../storage/VaultControllerStorage.sol";
import { IVault } from "../interfaces/IVault.sol";
import { IPositioning } from "../interfaces/IPositioning.sol";
import { IAccountBalance } from "../interfaces/IAccountBalance.sol";
import { PerpSafeCast } from "../libs/PerpSafeCast.sol";
import { PerpMath } from "../libs/PerpMath.sol";
import { SettlementTokenMath } from "../libs/SettlementTokenMath.sol";
import { TestERC20 } from "../test/TestERC20.sol";
import { IVault } from "../interfaces/IVault.sol";
import { Vault } from "./Vault.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

contract VaultController is ReentrancyGuardUpgradeable, BaseRelayRecipient, OwnerPausable, VaultControllerStorage {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using PerpSafeCast for uint256;
    using PerpSafeCast for uint128;
    using PerpSafeCast for int256;
    using PerpMath for uint256;
    using PerpMath for uint160;
    using PerpMath for uint128;
    using PerpMath for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    bool public isZkSync;

    function initialize(
        address positioningArg,
        address accountBalanceArg,
        address vaultImplementationArg
    ) external initializer {
        __ReentrancyGuard_init();
        __OwnerPausable_init();

        _positioning = positioningArg;
        _accountBalance = accountBalanceArg;
        _vaultImplementation = vaultImplementationArg;

        // Get networkId & check for ZkSync
        uint256 networkId;
        assembly {
            networkId := chainid()
        }

        // TODO: Update ZkSync networkId (currently using 280)
        isZkSync = (networkId == 280) ? true : false;
    }

    function deployVault(address _token) external returns (address) {
        IVault vault;
        if (isZkSync) {
            vault = new Vault();

            vault.initialize(_positioning, _accountBalance, _token,  address(this));
        } else {
            bytes32 salt = keccak256(abi.encodePacked(_positioning, _token));

            vault = Vault(Clones.cloneDeterministic(_vaultImplementation, salt));
            vault.initialize(_positioning, _accountBalance, _token, address(this));
        }
        _vaultAddress[_token] = address(vault);
        return address(vault);
    }

    function getVault(address _token) public view returns (address vault) {
        vault = _vaultAddress[_token];
    }

    function deposit(address token, uint256 amountX10_D) external whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0),"VC_VOTNA");
        address from = _msgSender();
        address[] storage _vaultList = _tradersVaultMap[from];
        if (IVault(_vault).getBalance(from) == 0) {
            _vaultList.push(_vault);
        }
        IVault(_vault).deposit(token, amountX10_D, from);
    }

    function withdraw(address token, uint256 amountX10_D) external whenNotPaused nonReentrant {
        address _vault = getVault(token);
        // vault of token is not available
        require(_vault != address(0),"VC_VOTNA");
        address to = _msgSender();
        IVault(_vault).withdraw(token, amountX10_D, to);
    }

    function getAccountValue(address trader) public whenNotPaused nonReentrant returns (int256) {
        int256 fundingPayment = IPositioning(_positioning).getAllPendingFundingPayment(trader);
        (int256 owedRealizedPnl, int256 unrealizedPnl, uint256 pendingFee) =
            IAccountBalance(_accountBalance).getPnlAndPendingFee(trader);

        address[] storage _vaultList = _tradersVaultMap[trader];
        uint256 vaultLen = _vaultList.length;
        int256 balanceX10_18 = 0;

        for (uint256 i; i < vaultLen; i++) {
            balanceX10_18 = balanceX10_18.add(
                SettlementTokenMath.parseSettlementToken(
                    IVault(_vaultList[i]).getBalance(trader),
                    IVault(_vaultList[i]).decimals()
                )
            );
        }
        // accountValue = collateralValue + owedRealizedPnl - fundingPayment + unrealizedPnl + pendingMakerFee
        return balanceX10_18.add(owedRealizedPnl.sub(fundingPayment)).add(unrealizedPnl).add(pendingFee.toInt256());
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgSender() internal view override(BaseRelayRecipient, OwnerPausable) returns (address payable) {
        return super._msgSender();
    }

    /// @inheritdoc BaseRelayRecipient
    function _msgData() internal view override(BaseRelayRecipient, OwnerPausable) returns (bytes memory) {
        return super._msgData();
    }
}
