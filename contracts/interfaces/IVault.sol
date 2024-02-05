// SPDX-License-Identifier: BUSL - 1.1
pragma solidity =0.8.18;

import { IPerpPeriphery } from "./IPerpPeriphery.sol";

interface IVault {
    /// @notice Emitted when trader deposit collateral into vault
    /// @param collateralToken The address of token that was deposited
    /// @param trader The address of trader
    /// @param amount The amount of token that was deposited
    event Deposited(address indexed collateralToken, address indexed trader, uint256 amount);
    /// @notice Emitted when trader withdraw collateral from vault
    /// @param collateralToken The address of token that was withdrawn
    /// @param trader The address of trader
    /// @param amount The amount of token that was withdrawn
    event Withdrawn(address indexed collateralToken, address indexed trader, uint256 amount);
    /// @notice Emitted when vault have low balance
    /// @param amount The amount needed to the vault
    event LowBalance(uint256 amount);
    /// @notice Emitted when vault borrow the amount
    /// @param from The address which send the fund
    /// @param amount The amount needed to the vault
    event BorrowFund(address from, uint256 amount);
    /// @notice Emitted when vault repay the debt
    /// @param to The address which fund was refunded
    /// @param amount The amount of the fund
    event DebtRepayed(address to, uint256 amount);
    event HighWeightAmountDeposited(address indexed from, uint256 amount, uint256 updatedVaultBalance);
    event HighWeightAmountWithdrawn(address indexed from, uint256 amount, uint256 updatedVaultBalance);

    function initialize(address PositioningConfigArg, address accountBalanceArg, address tokenArg, address vaultControllerArg) external;
    /// @notice Deposit collateral into vault
    /// @param amount The amount of the token to deposit
    /// @param from The address of the trader
    function deposit(IPerpPeriphery periphery, uint256 amount, address from) external;
    /// @notice Withdraw collateral from vault
    /// @param amount The amount of the token to withdraw
    /// @param to The address of the trader
    function withdraw(uint256 amount, address to) external;
    /// @notice transfer fund to vault in case of low balance
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token vault need funding
    /// @param amount The amount of the token to withdraw
    function transferFundToVault(address token, uint256 amount) external;
    /// @notice function to repay debt taken during low balance period
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token
    /// @param amount The amount of the token to withdraw
    function repayDebtToOwner(address token, uint256 amount) external;
    /// @notice Set new settlement token
    /// @param newTokenArg The address of `Positioning` contract
    function setSettlementToken(address newTokenArg) external;
    /// @notice Set positioning contract
    function setPositioning(address PositioningArg) external;
    /// @notice Set vault controller contract
    function setVaultController(address vaultControllerArg) external;
    /// @notice Get settlement token address
    /// @return settlementToken The address of settlement token
    function getSettlementToken() external view returns (address settlementToken);
    /// @notice Get settlement token decimals
    /// @dev cached the settlement token's decimal for gas optimization
    /// @return decimals The decimals of settlement token
    function decimals() external view returns (uint8 decimals);
    /// @notice Get the debt amount in vault
    /// @return debtAmount The debt amount
    function getTotalDebt() external view returns (uint256 debtAmount);
    /// @notice Get `PositioningConfig` contract address
    /// @return PositioningConfig The address of `PositioningConfig` contract
    function getPositioningConfig() external view returns (address PositioningConfig);
    /// @notice Get `AccountBalance` contract address
    /// @return accountBalance The address of `AccountBalance` contract
    function getAccountBalance() external view returns (address accountBalance);
    /// @notice Get `Positioning` contract address
    /// @return Positioning The address of `Positioning` contract
    function getPositioning() external view returns (address);
    /// @notice Get `Vault controller` contract address
    function getVaultController() external view returns (address);
}
