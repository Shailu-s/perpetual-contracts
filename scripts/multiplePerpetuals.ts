import { ethers, upgrades, run } from "hardhat";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const capRatio = "400000000";
const arbitrumChainId = [42161, 421613];
const positioning = async () => {
  const [owner] = await ethers.getSigners();
  console.log("Deployer: ", await owner.getAddress());
  const ethBefore = await owner.getBalance();
  console.log("Balance: ", ethBefore.toString());

  const FEE_DATA = {
    maxFeePerGas: ethers.utils.parseUnits("100", "gwei"),
    maxPriorityFeePerGas: ethers.utils.parseUnits("5", "gwei"),
    baseFeePerGas: ethers.utils.parseUnits("20", "gwei"),
  };

  const provider = new ethers.providers.FallbackProvider([ethers.provider], 1);
  provider.getFeeData = async () => FEE_DATA;
  const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  const MatchingEngine = await ethers.getContractFactory("MatchingEngine", signer);
  const VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken", signer);
  const VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken", signer);
  const PerpetualOracle = await ethers.getContractFactory("PerpetualOracle", signer);
  const VaultController = await ethers.getContractFactory("VaultController", signer);
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig", signer);
  const AccountBalance = await ethers.getContractFactory("AccountBalance", signer);
  const Positioning = await ethers.getContractFactory("Positioning", signer);
  const Vault = await ethers.getContractFactory("Vault", signer);
  const MarketRegistry = await ethers.getContractFactory("MarketRegistry", signer);
  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery", signer);
  const TestERC20 = await ethers.getContractFactory("TetherToken", signer);
  const VolmexPerpView = await ethers.getContractFactory("VolmexPerpView", signer);
  const networkDetail = await ethers.provider.getNetwork();
  const isArbitrum = arbitrumChainId.includes(networkDetail.chainId);

  console.log("Deploying PerView ...");
  const perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
  await perpView.deployed();
  await (await perpView.grantViewStatesRole(owner.address)).wait();
  console.log(perpView.address);

  console.log("Deploying Base Token ...");
  const volmexBaseToken1 = await upgrades.deployProxy(
    VolmexBaseToken,
    [
      "Virtual ETH Index Token", // nameArg
      "VEVIV", // symbolArg,
      owner.address, // zero address on init
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await volmexBaseToken1.deployed();
  console.log(volmexBaseToken1.address);
  await (await perpView.setBaseToken(volmexBaseToken1.address)).wait();

  const volmexBaseToken2 = await upgrades.deployProxy(
    VolmexBaseToken,
    [
      "Bitcoin Volmex Implied Volatility Index", // nameArg
      "BVIV", // symbolArg,
      owner.address, // priceFeedArg
      true, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await volmexBaseToken2.deployed();
  console.log(volmexBaseToken2.address);
  await (await perpView.setBaseToken(volmexBaseToken2.address)).wait();

  console.log("Deploying Perpetuals oracle ...");

  const perpetualOracle = await upgrades.deployProxy(
    PerpetualOracle,
    [
      [volmexBaseToken1.address, volmexBaseToken2.address],
      [71000000, 52000000],
      [52000000, 50000000],
      [proofHash, proofHash],
      owner.address,
    ],
    { initializer: "__PerpetualOracle_init" },
  );

  await perpetualOracle.deployed();
  await (await volmexBaseToken1.setPriceFeed(perpetualOracle.address)).wait();
  await (await volmexBaseToken2.setPriceFeed(perpetualOracle.address)).wait();
  if (process.env.INDEX_OBSERVATION_ADDER) {
    await (
      await perpetualOracle.setIndexObservationAdder(process.env.INDEX_OBSERVATION_ADDER)
    ).wait();
  }

  console.log("Deploying Quote Token ...");
  const volmexQuoteToken = await upgrades.deployProxy(
    VolmexQuoteToken,
    [
      "Virtual USD Coin", // nameArg
      "VUSDT", // symbolArg,
      false, // isBase
    ],
    {
      initializer: "initialize",
    },
  );
  await volmexQuoteToken.deployed();
  console.log(volmexQuoteToken.address);
  await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

  console.log("Deploying USDT ...");
  let usdtAddress = process.env.USDT;
  if (!process.env.USDT) {
    const usdt = await TestERC20.deploy(
      "1000000000000000000",
      `USD${isArbitrum ? "T" : "C"} Volmex Testnet`,
      `USD${isArbitrum ? "T" : "C"}`,
      6,
    );
    await usdt.deployed();
    usdtAddress = usdt.address;
    console.log(usdt.address);
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
    [volmexBaseToken1.address, volmexBaseToken2.address],
    matchingEngine.address,
    process.env.VOLMEX_MULTISIG ? process.env.VOLMEX_MULTISIG : owner.address,
  ]);
  await accountBalance.deployed();
  console.log(accountBalance.address);
  await (await perpView.setAccount(accountBalance.address)).wait();
  console.log("Set accounts - positioning config ...");
  await (await positioningConfig.setAccountBalance(accountBalance.address)).wait();

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
    volmexQuoteToken.address,
    [volmexBaseToken1.address, volmexBaseToken2.address],
  ]);
  await marketRegistry.deployed();
  console.log(marketRegistry.address);
  console.log("Deploying Positioning ...");
  const positioning = await upgrades.deployProxy(
    Positioning,
    [
      positioningConfig.address,
      vaultController.address,
      accountBalance.address,
      matchingEngine.address,
      perpetualOracle.address,
      marketRegistry.address,
      [volmexBaseToken1.address, volmexBaseToken2.address],
      [owner.address, `${process.env.LIQUIDATOR}`],
      ["10000000000000000000", "10000000000000000000"],
    ],
    {
      initializer: "initialize",
    },
  );
  await positioning.deployed();
  console.log(positioning.address);
  console.log("Set positioning - positioning config ...");
  await (await positioningConfig.setPositioning(positioning.address)).wait();
  console.log("Set positioning - accounts ...");
  await (await accountBalance.setPositioning(positioning.address)).wait();
  console.log("Set positioning - mark oracle ...");
  await (await perpetualOracle.setPositioning(positioning.address)).wait();
  console.log("Grant match order ...");
  await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
  console.log("Set at perp view ...");
  await (await perpView.setPositioning(positioning.address)).wait();
  await (await perpView.incrementPerpIndex()).wait();
  console.log("Set minter-burner ...");
  await (await volmexBaseToken1.setMintBurnRole(positioning.address)).wait();
  await (await volmexBaseToken2.setMintBurnRole(positioning.address)).wait();
  await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

  console.log("Set fee receiver ...");
  await (await positioning.setDefaultFeeReceiver(owner.address)).wait();
  console.log("Set positioning ...");
  await (await vaultController.setPositioning(positioning.address)).wait();
  console.log("Register vault ...");
  await (await vaultController.registerVault(vault.address, usdtAddress)).wait();
  console.log("Set maker fee ...");
  await marketRegistry.setMakerFeeRatio("400");
  console.log("Set taker fee ...");
  await marketRegistry.setTakerFeeRatio("900");

  console.log("Deploying Periphery contract ...");
  const periphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
    perpView.address,
    perpetualOracle.address,
    [vault.address, vault.address],
    owner.address,
    process.env.RELAYER ? process.env.RELAYER : owner.address,
  ]);
  await periphery.deployed();
  console.log(periphery.address);

  const proxyAdmin = await upgrades.admin.getInstance();
  await (await perpView.grantViewStatesRole(owner.address)).wait();

  const addresses = {
    AccountBalance: accountBalance.address,
    BaseToken1: volmexBaseToken1.address,
    BaseToken2: volmexBaseToken2.address,
    PerpetualOracles: perpetualOracle.address,
    MarketRegistry: marketRegistry.address,
    MatchingEngine: matchingEngine.address,
    Periphery: periphery.address,
    PerpView: perpView.address,
    Positioning: positioning.address,
    PositioningConfig: positioningConfig.address,
    QuoteToken: volmexQuoteToken.address,
    Vault: vault.address,
    VaultController: vaultController.address,
    USDT: usdtAddress,
    Deployer: await owner.getAddress(),
  };
  console.log("\n =====Deployment Successful===== \n");
  console.log(addresses);
  const ethAfter = await owner.getBalance();
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
      address: await proxyAdmin.getProxyImplementation(volmexBaseToken1.address),
    });
  } catch (error) {
    console.log("ERROR - verify - base token 1 !");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(volmexBaseToken2.address),
    });
  } catch (error) {
    console.log("ERROR - verify - base token 2 !");
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
