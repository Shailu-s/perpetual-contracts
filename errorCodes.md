# Error Codes

>

## Funding Rate contract

> **P_IZ**

    When Index price is 0

## Market Registry contract

> **MR_RO**

    In check ratio modifier when value passed in ratio is greater then 1e6.

> **MR_QTNC**

    This error occurs when market registery contract is initialized with non contract address of quote token

> **MarketRegistry: not base token**

    When a non base  token is registered using add base token method then this error occurs

> **MarketRegistry: Not admin**

    When a setter method is called in market registery and caller do not have MARKET_REGISTRY_ADMIN role.

## Positioning Callee contract

> **PositioningCallee: Not admin**

    When set positioning method is called by a user who do not have POSITIONING_CALLEE_ADMIN role then this error is thrown.

> **CHD_OP**

    When caller is not positioning contract then this error is thrown.

## Matching Engine

> **MatchingEngineCore: Not admin**

    When grantMatchOrder method is called to provide CAN_MATCH_ORDER role and is caller do not have MATCHING_ENGINE_ADMIN role then this error is thrown.

> **V_PERP_M: salt too low**

    When salt passed to cancel all order is less than msg.sender min salt value then this error is thrown.

> **V_PERP_M: not a maker**

    When msg.sender != trader  of order passed in cancel order function.

> **V_PERP_M: 0 salt can't be used**

    When order salt passed in cancel order function is 0 then this error is thrown.

> **V_PERP_M: order salt lower**

    When order.salt is < msg.sender minimum salt then this error is thrown.

> **V_PERP_M: order verification failed"**

    When makerOrder and takerOrder both have same traders then this error is thrown in match order function.

> **V_PERP_M: nothing to fill**

    When order with same salt is placed for same trader then this error is thrown.

> **V_PERP_M: left make assets don't match**

    When left order make asset token address is not same as right order take asset then this error is thrown.

> **V_PERP_M: left take assets don't match**

    When left order make asset token address is not same as right  order take asset then this error in thrown.

## Transfer executer contract

> **TransferExecutor: Not admin**

    When set transfer proxy is not called by user who has role TRANSFER_EXECUTOR.

## IndexPriceOracle contract

> **IndexPriceOracle: Not zero**

    When in add observation method underlying price of an asset is passed as zero then this error is thrown.

> **IndexPriceOracle: zero address**

    If observation adder address is passed as zero address.

> **IndexPriceOracle: Unequal length of prices & assets**

    When unequal length array is passed in `addAssets` method.

> **IndexPriceOracle: Asset address can't be 0**

    When zero address of base token is passed in `addAssets` method.

> **IndexPriceOracle: not admin**

    When following methods are not called by user address who has PRICE_ORACLE_ADMIN role.

```
 addAssets
 setObservationAdder
 setIndexSmInterval
 grantInitialTimestampRole
```

> **IndexPriceOracle: not observation adder**

    When addObservation method is called by account who do not have ADD_OBSERVATION_ROLE.

> **IndexPriceOracle: not first interval adder**

    When `setInitialTimeStamp` method is called by accound who do not have INITIAL_TIMESTAMP_ROLE.

## Mark Price Oracle contract

> **MarkPriceOracle: Not zero**

    When 0 price is passed in addObservation method.

> **MarkPriceOracle: zero address**

    When zero address is passed in setObservation.

> **MarkPriceOracle: Unequal length of prices & assets**

    When unequal lenght of arras are passed in addAssets method.

> **MarkPriceOracle: Asset address can't be 0**

    When asset address is passed and zero address in addAsset method.

> **MarkPriceOracle: not admin**

    When following methods are called with address who do nit have role PRICE_ORACLE_ADMIN.

```
setObservationAdder
setPositioning
setMarkEpochInterval
setIndexOracle
grantSmaIntervalRole
addAssets
```

> **MarkPriceOracle: not sma interval role**

    If setMarkSmInterval method is called by address who has not been granted SMA_INTERVAL_ROLE.

> **MarkPriceOracle: not observation adder**

    When addObservation method is called by account who do not have ADD_OBSERVATION_ROLE.

## Account Balance Method

> **AB_VPMMCNC**

    IPositioningConfig address is not contract when account balance contract is initialized

> **AccountBalance: not base token**

    When register base token is called with a non base token.

> **AB_MNE**

     markets number exceeds max market per account.

> **AccountBalance: Not admin**

    When following external methods are called with an address who do not have ACCOUNT_BALANCE_ADMIN role.

```
grantSettleRealizedPnlRole
setUnderlyingPriceIndex
```

> **AccountBalance: Not sm interval role**

When following external methods are called with an address who do not have SM_INTERVAL_ROLE role.

```
setSmInterval
setSmIntervalLiquidation
```

## Order Validator contract

> **V_PERP_M: maker is not tx sender**

    When an order is placed with 0 salt and msg.sender is not equal to order trader

> **V_PERP_M: Order canceled**

    When an order is placed with salt less than order.trader makerMinSalt.

> **V_PERP_M: contract order signature verification error**

    When an order is singed by a contract signature verification fails.

> **V_PERP_M: no trader**

    When order.trader address is zero

## Positioning Contract

> **P_VANC**

    When positioning contract is initialized with a non contract address of vault controller.

> **P_PCNC**

    When positioning contract is initialized with a non contract address of positioning Config.

> **P_ABNC**

    When positioning contract is initialized with a non contract address of account balance.

> **P_MENC**

    When positioning contract is initialized with a non contract address of Matching Engine.

> **V_VPMM**

    If setMarketRegistry method is called with a non contract address of market registry.

> **PC_DFRZ**

    Default Fee Receiver is zero.

> **P_AZ**

    Index price oracle is address zero.

> **V_PERP: Basetoken not registered at market**

    When base token of an order is not registered on in market registry.

> **P_PSZ**

    Position size is zero in getLiquidatablePosition.

> **V_PERP_OVF: Order Verification Failed**

    When order.trader address is zero in getOrderValidate method.

> **V_PERP_0S**

    When order salt is zero in getOrderValidate method.

> **V_PERP_M: order salt lower**

    When order salt is smaller the maker min salt of trader in getOrderValidate method.

> **V_PERP_NEFC**

    When user do not have enough free collateral to open position for given position size in order in getOrderValidate method.

> **V_PERP_NF: nothing to fill**

    When an order passed whose salt is already used by trader.

> **P_WLD**

    When a trader is liquidated in wrong direction of his position size.

> **P_EAV**

    When trader have enough account value that his account value is greater than minimum margin required.

> **CH_NEMRM**

    Not enough minimum required margin after reducing/closing position.

> **P_NEFCI**

    Not enough free collateral by imRatio to open a position.

> **Positioning: Not sm interval role**

    When following methods are called by an account who do not have SM_INTERVAL_ROLE role.

```
setSmInterval
setSmIntervalLiquidation
```

> **Positioning: Not admin**

    When following methods are called by an account who do not have POSITIONING_ADMIN role.

```
toggleLiquidatorWhitelist
whitelistLiquidator
setFundingPeriod
setIndexPriceOracle
setMarketRegistry
```

> **P_0IP**

Zero index price

> **Positioning: liquidator not whitelisted**

    When an account tries to liquidate a trader and that account is not a white list liquidator.

## Positioning Config contract

> **PC_RO**

    When setter method for ratios is passed with a ratio value > 1e6.

> **PC_IPCR**

When setPartialCloseRatio method is passed with a value less than 0.

> **PC_ITI**

    invalid twap interval 0.

> **PC_ITIL**

    invalid twapInterval in liquidation 0.

> **PC_IIMR**

    PositioningConfig: Invalid Initial Margin Ratio.

> **PC_IMMR**

    PositioningConfig: Invalid Maintenance Margin Ratio.

> **PC_IPLR**

    PositioningConfig: Invalid Partial Liquidation Ratio. Should not be less than zero.

> **PositioningConfig: Not admin**

    When setter method are called by an account who do not have POSITIONING_CONFIG_ADMIN role.

## Vault contract

> **V_OST**

    only vault settlement token can be used.

> **V_ISTD**

    invalid settlementToken decimals.

> **V_CHCNC**

    PositioningConfig address is not contract when vault is initialized.

> **V_ABNC**

    accountBalance address is not contract when vault is initialized.

> **V_VPMM**

    Positioning address is not contract when setPostioning method is called.

> **V_VPMM**

    Vault controller is not contract when setVaultController method is called.

> **V_AIMTD**

     amount is more that debt during repayment.

> **V_IBA**

    Inconsistent balance amount, to prevent from deflationary tokens.

> **V_GTSTBC**

    Greater than settlement token balance cap.

> **V_OVC**

    Only VaultController can call deposit and withdraw method from vault.

> **Vault: Not admin**

    msg.sender do not have VAULT_ADMIN role.

## Vault Controller contract

> **VC_VOTNA**

    Vault of token is not available while from the address of token passed as argument in deposit withdraw method.

> **VC_PNS**

     Positioning address is not set in vault controller.

> **VC_CDZA**

    can't deposit zero amount.

> **VC_CWZA**

    can't withdraw zero amount

> **V_NEFC**

    Not enough free collateral  to withdraw.

> **V_VPMM**

    Positioning is not contract.

> **VaultController: Not admin**

    Do not have VAULT_CONTROLLER_ADMIN role.

##  Periphery contract

> **PerpPeriphery: Admin can't be address(0)**

    When owner address is zero when periphery contract is initialized.

> **PerpPeriphery: Relayer can't be address(0)**

     When relayer address is zero when periphery contract is initialized.

> **PerpPeriphery: zero address**

     When perp view address is zero when periphery contract is initialized.

> **PerpPeriphery: Not relayer**

    When relayer address passed as zero while setting up relayer.

> **Periphery: mismatch orders**

    When left orders array and right orders array lengty mismatch in when batch open position is called.

> **Periphery: vault not whitelisted**

    Vault address is not white listed in periphery.

> **Periphery: left order price verification failed"**

    When left limit order price verification fails.

> **Periphery: right order price verification failed"**

    When right limit order price verification fails.

> **Periphery: Not admin**

    When msg.sender do not have _PERP_PERIPHERY role.

> **PerpPeriphery: Not relayer**

    When msg.sender do not have RELAYER_MULTISIG role.

> **Periphery: trader not whitelisted**

    When trader is not white listed.

> **PerpPeriphery: Not whitelister**

    Do not have TRADER_WHITELISTER role.

## Slashing contract

> **Slashing: not slasher role**

    msg.sender not have _SLASHER_ROLE.

## Staking contract

> **Staking: not relayer**

    Staker is not owner of the relayer multisig.

> **Staking: insufficient amount**

    When stakers balance + amount he wants to stake is less then min stake required.

> **Staking: nothing to unstake**

    When inactive balance is zero the user cannot unstake any thing.

> **Staking: insufficient cooldown**

    When cooldown period is not comleted.

> **Staking: invalid balance to cooldown**

    When user's active balance is zero.

> **Staking: not staker role**

    Do not have _STAKER_ROLE role.

> **Staking: not live**

    When staking is not live.

## ERC20TransferProxy contract

> **V_PERP_M: failure while transferring**

    Failure while transfer token.

> **Positioning: Not admin**

    Do not have TRANSFER_PROXY_ADMIN role.

## Insurance Fund contract

> **IF_TNC**

    Token address is not contract when insurance fund in initialized.

> **IF_BNC**

    Borrower is not a contract when borrower is set.

> **IF_OB**

    Caller is not borrower.

> **IF_NEB**

    Insurance funds do not have enough balance.

##LibFill Library

> **V_PERP_M: fillRight: unable to fill**

    When (Right order take asset value * Left order take  asset value)/left order make asset value > Right order make asset value.

> **V_PERP_M: fillLeft: unable to fill**

    When (Right order take asset value * Left order take  asset value)/Right order make asset value > Left order make asset value.

## LibOrder library

> **V_PERP_M: Order deadline validation failed**

    When order's deadline <  block timestamp.

> **Both makeAsset & takeAsset can't be baseTokens**

    When both make asset and take asset  virtual token of an order are same.

## LibPerpMath library

> **LibPerpMath: inversion overflow**

    When int256 value passed to neg256 has value less than -2**255.

## LibSingature library

> **ECDSA: invalid signature 's' value**

    When signature's s value uint256 is > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0.

> **ECDSA: invalid signature 'v' value**

    When singature's v-4 is not equal to 27 or 28.

> **ECDSA: invalid signature**

    When signer in equal to zero.
