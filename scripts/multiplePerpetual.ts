import { access } from "fs";
import { ethers, upgrades, run } from "hardhat";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const capRatio = "400000000";
const arbitrumChainId = [42161, 421613];
const positioning = async () => {
  const [owner] = await ethers.getSigners();
  console.log("Deployer: ", await owner.getAddress());
  const ethBefore = await ethers.provider.getBalance(owner.address);
  console.log("Balance: ", ethBefore.toString());
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";

  const MatchingEngine = await ethers.getContractFactory("MatchingEngine");
  const BaseToken = await ethers.getContractFactory("BaseToken");
  const QuoteToken = await ethers.getContractFactory("QuoteToken");
  const PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
  const VaultController = await ethers.getContractFactory("VaultController");
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig");
  const AccountBalance = await ethers.getContractFactory("AccountBalance");
  const Positioning = await ethers.getContractFactory("Positioning");
  const Vault = await ethers.getContractFactory("Vault");
  const MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  const PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
  const TestERC20 = await ethers.getContractFactory("TetherToken");
  const PerpView = await ethers.getContractFactory("PerpView");
  const FundingRate = await ethers.getContractFactory("FundingRate");
  const networkDetail = await ethers.provider.getNetwork();
  const isArbitrum = arbitrumChainId.includes(networkDetail.chainId);

  console.log("Deploying PerView ...");
  const perpView = await upgrades.deployProxy(PerpView, [owner.address]);
  await perpView.deployed();
  await (await perpView.grantViewStatesRole(owner.address)).wait();
  console.log(perpView.address);

  console.log("Deploying Base Token ...");
  const BaseToken1 = await upgrades.deployProxy(
    BaseToken,
    [
      "ETH  IV Token", // nameArg
      "EVIV", // symbolArg,
      owner.address, // zero address on init
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await BaseToken1.deployed();
  console.log(BaseToken1.address);
  await (await perpView.setBaseToken(BaseToken1.address)).wait();

  const BaseToken2 = await upgrades.deployProxy(
    BaseToken,
    [
      "Bitcoin  IV Token", // nameArg
      "BVIV", // symbolArg,
      owner.address, // priceFeedArg
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await BaseToken2.deployed();
  console.log(BaseToken2.address);
  await (await perpView.setBaseToken(BaseToken2.address)).wait();

  const BaseToken3 = await upgrades.deployProxy(
    BaseToken,
    [
      "Ethereum USD", // nameArg
      "ETHUSD", // symbolArg,
      owner.address, // priceFeedArg
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await BaseToken3.deployed();

  console.log(BaseToken3.address);
  await (await perpView.setBaseToken(BaseToken3.address)).wait();
  const BaseToken4 = await upgrades.deployProxy(
    BaseToken,
    [
      "Bitcoin USD", // nameArg
      "BTCUSD", // symbolArg,
      owner.address, // priceFeedArg
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await BaseToken3.deployed();

  console.log(BaseToken4.address);
  await (await perpView.setBaseToken(BaseToken4.address)).wait();

  console.log("Deploying Perpetuals oracle ...");

  const perpetualOracle = await upgrades.deployProxy(
    PerpetualOracle,
    [
      [
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
        BaseToken4.address,
      ],
      [71000000, 52000000, 30750000000, 1862000000],
      [52000000, 50000000],
      [proofHash, proofHash],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      [process.env.CHAINLINKAGRREGATOR_1, process.env.CHAINLINKAGRREGATOR_2],
      owner.address,
    ],
    { initializer: "__PerpetualOracle_init" },
  );

  await perpetualOracle.deployed();
  console.log(perpetualOracle.address);
  await (await BaseToken1.setPriceFeed(perpetualOracle.address)).wait();
  await (await BaseToken2.setPriceFeed(perpetualOracle.address)).wait();
  await (await BaseToken3.setPriceFeed(perpetualOracle.address)).wait();
  await (await BaseToken4.setPriceFeed(perpetualOracle.address)).wait();
  if (process.env.INDEX_OBSERVATION_ADDER) {
    await (
      await perpetualOracle.setIndexObservationAdder(process.env.INDEX_OBSERVATION_ADDER)
    ).wait();
    await perpetualOracle.grantCacheChainlinkPriceRole(owner.address);
  }

  console.log("Deploying Quote Token ...");
  const QuoteToken = await upgrades.deployProxy(
    QuoteToken,
    [
      `${isArbitrum ? "Tether Token" : "USD Coin"}`, // nameArg
      `"USD${isArbitrum ? "T" : "C"}"`, // symbolArg,
      false, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await QuoteToken.deployed();
  console.log(QuoteToken.address);
  await (await perpView.setQuoteToken(QuoteToken.address)).wait();

  console.log("Deploying USDT ...");
  let usdtAddress = process.env.USDT;
  if (!process.env.USDT) {
    const usdt = await TestERC20.deploy(
      "1000000000000000000",
      `USD${isArbitrum ? "T" : "C"}  Testnet`,
      `USD${isArbitrum ? "T" : "C"}`,
      6,
    );
    await usdt.deployed();
    usdtAddress = usdt.address;
    console.log(usdtAddress);
  }

  console.log("Deploying MatchingEngine ...");
  const matchingEngine = await upgrades.deployProxy(MatchingEngine, [
    owner.address,
    perpetualOracle.address,
  ]);
  await matchingEngine.deployed();
  console.log(matchingEngine.address);
  await (await perpetualOracle.setMarkObservationAdder(matchingEngine.address)).wait();
  await (await perpetualOracle.setIndexObservationAdder(owner.address)).wait();
  console.log("Deploying Positioning Config ...");
  const positioningConfig = await upgrades.deployProxy(PositioningConfig, [
    perpetualOracle.address,
  ]);
  await positioningConfig.deployed();
  console.log(positioningConfig.address);
  await (await perpetualOracle.grantSmaIntervalRole(positioningConfig.address)).wait();
  await positioningConfig.setMaxMarketsPerAccount(5);
  await positioningConfig.setSettlementTokenBalanceCap("10000000000000");

  console.log("Deploying Account Balance ...");
  const accountBalance = await upgrades.deployProxy(AccountBalance, [
    positioningConfig.address,
    [
      BaseToken1.address,
      BaseToken2.address,
      BaseToken3.address,
      BaseToken4.address,
    ],
    [chainlinkTokenIndex1, chainlinkTokenIndex2],
    matchingEngine.address,
    process.env._MULTISIG ? process.env._MULTISIG : owner.address,
  ]);
  await accountBalance.deployed();
  console.log(accountBalance.address);
  console.log("grant add underlying index role...");
  await (await accountBalance.grantAddUnderlyingIndexRole(perpetualOracle.address)).wait();
  await (await accountBalance.grantSigmaVivRole(perpetualOracle.address)).wait();
  await (await perpView.setAccount(accountBalance.address)).wait();
  console.log("Set accounts - positioning config ...");
  await (await positioningConfig.setAccountBalance(accountBalance.address)).wait();
  await (await perpetualOracle.setAccountBalance(accountBalance.address)).wait();
  console.log("Deploying Vault Controller ...");
  const vaultController = await upgrades.deployProxy(VaultController, [
    positioningConfig.address,
    accountBalance.address,
  ]);
  await vaultController.deployed();
  console.log(vaultController.address);
  await (await accountBalance.grantSettleRealizedPnlRole(vaultController.address)).wait();
  await (await perpView.setVaultController(vaultController.address)).wait();

  console.log("Deploying Vault ...");
  const vault = await upgrades.deployProxy(Vault, [
    positioningConfig.address,
    accountBalance.address,
    usdtAddress,
    vaultController.address,
  ]);
  await vault.deployed();
  console.log(vault.address);
  await (await perpView.incrementVaultIndex()).wait();
  console.log("Deploying MarketRegistry ...");
  const marketRegistry = await upgrades.deployProxy(MarketRegistry, [
    QuoteToken.address,
    [
      BaseToken1.address,
      BaseToken2.address,
      BaseToken3.address,
      BaseToken4.address,
    ],
    [0, 1, chainlinkTokenIndex1, chainlinkTokenIndex2],
  ]);
  await marketRegistry.deployed();
  console.log(marketRegistry.address);
  console.log("grant add base token role...");
  await marketRegistry.grantAddBaseTokenRole(perpetualOracle.address);
  await (await perpetualOracle.setMarketRegistry(marketRegistry.address)).wait();
  console.log("Deploying Funding rate ...");
  const fundingRate = await upgrades.deployProxy(
    FundingRate,
    [perpetualOracle.address, positioningConfig.address, accountBalance.address, owner.address],
    {
      initializer: "FundingRate_init",
    },
  );
  await fundingRate.deployed();
  console.log(fundingRate.address);
  console.log("Deploying Positioning ...");
  const positioning = await upgrades.deployProxy(
    Positioning,
    [
      positioningConfig.address,
      vaultController.address,
      accountBalance.address,
      matchingEngine.address,
      perpetualOracle.address,
      fundingRate.address,
      marketRegistry.address,
      [
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
        BaseToken4.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      [owner.address, `${process.env.LIQUIDATOR}`],
      ["10000000000000000000", "10000000000000000000"],
    ],
    {
      initializer: "initialize",
    },
  );
  await positioning.deployed();
  console.log(positioning.address);
  console.log("grant add underlying index");
  await (await positioning.grantAddUnderlyingIndexRole(owner.address)).wait();
  console.log("Set positioning - positioning config ...");
  await (await positioningConfig.setPositioning(positioning.address)).wait();
  console.log("Set positioning - accounts ...");
  await (await accountBalance.setPositioning(positioning.address)).wait();
  console.log("Set positioning -  oracle ...");
  await (await perpetualOracle.setPositioning(positioning.address)).wait();
  console.log("Set Funding rate -  oracle ...");
  await (await perpetualOracle.setFundingRate(fundingRate.address)).wait();
  console.log("Grant match order ...");
  await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
  console.log("Set at perp view ...");
  await (await perpView.setPositioning(positioning.address)).wait();
  await (await perpView.incrementPerpIndex()).wait();
  console.log("grant cache chain link price role");
  await (await perpetualOracle.grantCacheChainlinkPriceRole(positioning.address)).wait();
  console.log("Set minter-burner ...");
  await (await BaseToken1.setMintBurnRole(positioning.address)).wait();
  await (await BaseToken2.setMintBurnRole(positioning.address)).wait();
  await (await BaseToken3.setMintBurnRole(positioning.address)).wait();
  await (await BaseToken4.setMintBurnRole(positioning.address)).wait();
  await (await QuoteToken.setMintBurnRole(positioning.address)).wait();
  await console.log("Set fee receiver ...");
  await (await positioning.setDefaultFeeReceiver(owner.address)).wait();
  console.log("Set positioning ...");
  await (await vaultController.setPositioning(positioning.address)).wait();
  console.log("Register vault ...");
  await (await vaultController.registerVault(vault.address, usdtAddress)).wait();

  console.log("Set maker fee ...");
  await marketRegistry.setMakerFeeRatio("400");
  console.log("Set taker fee ...");
  await marketRegistry.setTakerFeeRatio("900");
  console.log(" set min position size ...");
  await positioning.setMinPositionSize("1000000000000000", BaseToken3.address);
  await positioning.setMinPositionSize("3000000000000000", BaseToken4.address);

  console.log("Deploying Periphery contract ...");
  const periphery = await upgrades.deployProxy(PerpPeriphery, [
    perpView.address,
    perpetualOracle.address,
    [vault.address, vault.address],
    owner.address,
    process.env.RELAYER ? process.env.RELAYER : owner.address,
  ]);
  await periphery.deployed();
  console.log(periphery.address);
  await (await vaultController.setPeriphery(periphery.address)).wait();
  const proxyAdmin = await upgrades.admin.getInstance();
  await (await perpView.grantViewStatesRole(owner.address)).wait();

  const addresses = {
    AccountBalance: accountBalance.address,
    BaseToken1: BaseToken1.address,
    BaseToken2: BaseToken2.address,
    BaseToken3: BaseToken3.address,
    BaseToken4: BaseToken4.address,
    PerpetualOracles: perpetualOracle.address,
    FundingRate: fundingRate.address,
    MarketRegistry: marketRegistry.address,
    MatchingEngine: matchingEngine.address,
    Periphery: periphery.address,
    PerpView: perpView.address,
    Positioning: positioning.address,
    PositioningConfig: positioningConfig.address,
    QuoteToken: QuoteToken.address,
    Vault: vault.address,
    VaultController: vaultController.address,
    USDT: usdtAddress,
    Deployer: await owner.getAddress(),
  };
  console.log("\n =====Deployment Successful===== \n");
  console.log(addresses);
  const ethAfter = await ethers.provider.getBalance(owner.address);
  console.log("ETH burned: ", ethBefore.sub(ethAfter).toString());

  if (process.env.NOT_VERIFY) {
    return;
  }

  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(perpetualOracle.address),
    });
  } catch (error) {
    console.log("ERROR - verify - Perpetual oracles", error);
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(BaseToken1.address),
    });
  } catch (error) {
    console.log("ERROR - verify - base token 1 !");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(BaseToken2.address),
    });
  } catch (error) {
    console.log("ERROR - verify - base token 2 !");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(QuoteToken.address),
    });
  } catch (error) {
    console.log("ERROR - verify - quote token!");
  }
  try {
    await run("verify:verify", {
      address: usdtAddress,
      constructorArguments: ["1000000000000000000", "Tether USD", "USDT", 6],
    });
  } catch (error) {
    console.log("ERROR - verify - usdt token!");
  }

  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(matchingEngine.address),
    });
  } catch (error) {
    console.log("ERROR - verify - matching engine!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(positioningConfig.address),
    });
  } catch (error) {
    console.log("ERROR - verify - positioning config!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(accountBalance.address),
    });
  } catch (error) {
    console.log("ERROR - verify - account balance!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(vault.address),
    });
  } catch (error) {
    console.log("ERROR - verify - vault!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(vaultController.address),
    });
  } catch (error) {
    console.log("ERROR - verify - vault controller!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(positioning.address),
    });
  } catch (error) {
    console.log("ERROR - verify - positioning!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(marketRegistry.address),
    });
  } catch (error) {
    console.log("ERROR - verify - market registry!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(periphery.address),
    });
  } catch (error) {
    console.log("ERROR - verify - periphery!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(perpView.address),
    });
  } catch (error) {
    console.log("ERROR - verify - perp view!");
  }
};

positioning()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
