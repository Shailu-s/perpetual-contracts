import { ethers, upgrades, run } from "hardhat";

const positioning = async () => {
  const [owner] = await ethers.getSigners();
  console.log("Deployer: ", await owner.getAddress());
  console.log("Balance: ", (await owner.getBalance()).toString());

  const MatchingEngine = await ethers.getContractFactory("MatchingEngine");
  const PerpFactory = await ethers.getContractFactory("PerpFactory");
  const VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
  const VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
  const MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
  const IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
  const VaultController = await ethers.getContractFactory("VaultController");
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig");
  const AccountBalance = await ethers.getContractFactory("AccountBalance");
  const Positioning = await ethers.getContractFactory("Positioning");
  const Vault = await ethers.getContractFactory("Vault");
  const MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");

  console.log("Deploying PerView ...");
  const perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
  await perpView.deployed();
  await (await perpView.grantViewStatesRole(owner.address)).wait();

  console.log("Deploying Index Price Oracle ...");
  const indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
    initializer: "initialize",
  });
  await indexPriceOracle.deployed();

  console.log("Deploying Base Token ...");
  const volmexBaseToken = await upgrades.deployProxy(
    VolmexBaseToken,
    [
      "Virtual ETH Index Token", // nameArg
      "VEVIV", // symbolArg,
      indexPriceOracle.address, // priceFeedArg
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await volmexBaseToken.deployed();
  await (await perpView.setBaseToken(volmexBaseToken.address)).wait();

  console.log("Deploying Quote Token ...");
  const volmexQuoteToken = await upgrades.deployProxy(
    VolmexQuoteToken,
    [
      "Virtual USD Coin", // nameArg
      "VUSDC", // symbolArg,
      false, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await volmexQuoteToken.deployed();
  await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

  console.log("Deploying Mark Price Oracle ...");
  const markPriceOracle = await upgrades.deployProxy(
    MarkPriceOracle,
    [[1000000], [volmexBaseToken.address]],
    {
      initializer: "initialize",
    },
  );
  await markPriceOracle.deployed();

  console.log("Deploying USDC ...");
  let usdcAddress = process.env.USDC;
  if (!process.env.USDC) {
    const usdc = await upgrades.deployProxy(TestERC20, ["USD Coin", "USDC", 6], {
      initializer: "__TestERC20_init",
    });
    await usdc.deployed();
    usdcAddress = usdc.address;
  }

  console.log("Deploying MatchingEngine ...");
  const matchingEngine = await upgrades.deployProxy(MatchingEngine, [
    owner.address,
    markPriceOracle.address,
  ]);
  await matchingEngine.deployed();
  await (await markPriceOracle.setMatchingEngine(matchingEngine.address)).wait();

  console.log("Deploying Positioning Config ...");
  const positioningConfig = await upgrades.deployProxy(PositioningConfig, []);
  await positioningConfig.deployed();
  await positioningConfig.setMaxMarketsPerAccount(5);
  await positioningConfig.setSettlementTokenBalanceCap("10000000000000");

  console.log("Deploying Account Balance ...");
  const accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
  await accountBalance.deployed();
  await (await perpView.setAccount(accountBalance.address)).wait();

  console.log("Deploying Vault Controller ...");
  const vaultController = await upgrades.deployProxy(VaultController, [
    positioningConfig.address,
    accountBalance.address,
  ]);
  await vaultController.deployed();
  await (await accountBalance.grantSettleRealizedPnlRole(vaultController.address)).wait();
  await (await perpView.setVaultController(vaultController.address)).wait();

  console.log("Deploying Vault ...");
  const vault = await upgrades.deployProxy(Vault, [
    positioningConfig.address,
    accountBalance.address,
    usdcAddress,
    vaultController.address,
    false,
  ]);
  await vault.deployed();
  await (await perpView.incrementVaultIndex()).wait();

  console.log("Deploying Positioning ...");
  const positioning = await upgrades.deployProxy(
    Positioning,
    [
      positioningConfig.address,
      vaultController.address,
      accountBalance.address,
      matchingEngine.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      0,
      [owner.address, `${process.env.LIQUIDATOR}`],
    ],
    {
      initializer: "initialize",
    },
  );
  await positioning.deployed();
  console.log("Set positioning ...");
  await (await accountBalance.setPositioning(positioning.address)).wait();
  console.log("Grant match order ...");
  await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
  console.log("Set at perp view ...");
  await (await perpView.setPositioning(positioning.address)).wait();
  await (await perpView.incrementPerpIndex()).wait();
  console.log("Set minter-burner ...");
  await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
  await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

  console.log("Deploying MarketRegistry ...");
  const marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);
  await marketRegistry.deployed();
  console.log("Add base token ...");
  await (await marketRegistry.addBaseToken(volmexBaseToken.address)).wait();
  console.log("Set market ...");
  await (await positioning.setMarketRegistry(marketRegistry.address)).wait();
  console.log("Set fee receiver ...");
  await (await positioning.setDefaultFeeReceiver(owner.address)).wait();
  console.log("Set positioning ...");
  await (await vaultController.setPositioning(positioning.address)).wait();
  console.log("Register vault ...");
  await (await vaultController.registerVault(vault.address, usdcAddress)).wait();
  console.log("Set maker fee ...");
  await marketRegistry.setMakerFeeRatio(0.0004e6);
  console.log("Set taker fee ...");
  await marketRegistry.setTakerFeeRatio(0.0009e6);

  console.log("Deploying Periphery contract ...");
  const periphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
    perpView.address,
    markPriceOracle.address,
    [vault.address, vault.address],
    owner.address,
    `${process.env.RELAYER}`, // RELAYER
  ]);
  await periphery.deployed();

  const proxyAdmin = await upgrades.admin.getInstance();

  console.log("Deploying Perpetual Factory ...");
  const factory = await upgrades.deployProxy(
    PerpFactory,
    [
      await proxyAdmin.getProxyImplementation(volmexBaseToken.address),
      await proxyAdmin.getProxyImplementation(volmexQuoteToken.address),
      await proxyAdmin.getProxyImplementation(vaultController.address),
      await proxyAdmin.getProxyImplementation(vault.address),
      await proxyAdmin.getProxyImplementation(positioning.address),
      await proxyAdmin.getProxyImplementation(accountBalance.address),
      await proxyAdmin.getProxyImplementation(perpView.address),
      await proxyAdmin.getProxyImplementation(marketRegistry.address),
    ],
    {
      initializer: "initialize",
    },
  );
  await factory.deployed();
  await (await perpView.grantViewStatesRole(factory.address)).wait();

  const addresses = {
    USDC: usdcAddress,
    IndexPriceOracle: indexPriceOracle.address,
    MarkPriceOracle: markPriceOracle.address,
    BaseToken: volmexBaseToken.address,
    QuoteToken: volmexQuoteToken.address,
    MatchingEngine: matchingEngine.address,
    Vault: vault.address,
    VaultController: vaultController.address,
    MarketRegistry: marketRegistry.address,
    AccountBalance: accountBalance.address,
    PositioningConfig: positioningConfig.address,
    Positioning: positioning.address,
    Periphery: periphery.address,
    PerpView: perpView.address,
  };
  console.log("\n =====Deployment Successful===== \n");
  console.log(addresses);

  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(indexPriceOracle.address),
    });
  } catch (error) {
    console.log("ERROR - verify - Index price oracle", error);
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(volmexBaseToken.address),
    });
  } catch (error) {
    console.log("ERROR - verify - base token!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(volmexQuoteToken.address),
    });
  } catch (error) {
    console.log("ERROR - verify - quote token!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(usdcAddress),
    });
  } catch (error) {
    console.log("ERROR - verify - usdc token!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(markPriceOracle.address),
    });
  } catch (error) {
    console.log("ERROR - verify - mark price oracle!");
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
      address: await proxyAdmin.getProxyImplementation(factory.address),
    });
  } catch (error) {
    console.log("ERROR - verify - factory!");
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
