// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.6;

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

    function initialize(
        address PositioningConfigArg,
        address accountBalanceArg,
        address tokenArg,
        address vaultControllerArg
    ) external;

    /// @notice Deposit collateral into vault
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token to deposit
    /// @param amountX10_D The amount of the token to deposit in decimals D (D = _decimals)
    function deposit(
        address token,
        uint256 amountX10_D,
        address from
    ) external;

    function depositEther(address token, address from) external payable;
    
    /// @notice Withdraw collateral from vault
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token sender is going to withdraw
    /// @param amountX10_D The amount of the token to withdraw in decimals D (D = _decimals)
    function withdraw(
        address token,
        uint256 amountX10_D,
        address to
    ) external;

    /// @notice transfer fund to vault in case of low balance
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token vault need funding
    /// @param amountX10_D The amount of the token to withdraw in decimals D (D = _decimals)
    function transferFundToVault(address token, uint256 amountX10_D) external;

    /// @notice function to repay debt taken during low balance period
    /// @dev once multi-collateral is implemented, the token is not limited to settlementToken
    /// @param token The address of the token
    /// @param amountX10_D The amount of the token to withdraw in decimals D (D = _decimals)
    function repayDebtToOwner(address token, uint256 amountX10_D) external;

    /// @notice Set new settlement token
    /// @param newTokenArg The address of `Positioning` contract
    function setSettlementToken(address newTokenArg) external;

    /// @notice Get the balance in vault of specified account
    /// @return balance The balance amount
    function getBalance(address account) external view returns (int256 balance);

    /// @notice Get free collateral amount of specified trader
    /// @param trader The address of the trader
    /// @return freeCollateral Max(0, amount of collateral available for withdraw or opening new positions or orders)
    function getFreeCollateral(address trader) external view returns (uint256 freeCollateral);

    /// @notice Get free collateral amount of specified trader and collateral ratio
    /// @dev There are three configurations for different insolvency risk tolerances: **conservative, moderate,
    /// aggressive**, we will start with the **conservative** one and gradually move to aggressive to
    /// increase capital efficiency
    /// @param trader The address of the trader
    /// @param ratio The margin requirement ratio, imRatio or mmRatio
    /// @return freeCollateralByRatio freeCollateral, by using the input margin requirement ratio; can be negative
    function getFreeCollateralByRatio(address trader, uint24 ratio)
        external
        view
        returns (int256 freeCollateralByRatio);

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
}
