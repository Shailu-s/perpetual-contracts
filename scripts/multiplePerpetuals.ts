import { ethers, upgrades, run } from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { Wallet, utils, ContractFactory } from "zksync-web3";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import hardhat from "hardhat";

const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const capRatio = "400000000";
const arbitrumChainId = [42161, 421613];
const positioning = async (hre: HardhatRuntimeEnvironment) => {
  const [owner] = await ethers.getSigners();
  console.log("Deployer: ", await owner.getAddress());
  const ethBefore = await ethers.provider.getBalance(owner.address);
  console.log("Balance: ", ethBefore.toString());
  const wallet = new Wallet("ded016e6b77a5847bc4665207ab97157de8749cf96627de82da30734fef5c9aa");
  const deployer = new Deployer(hre, wallet);

  const MatchingEngine = await deployer.loadArtifact("MatchingEngine");
  const VolmexBaseToken = await deployer.loadArtifact("VolmexBaseToken");
  const VolmexQuoteToken = await deployer.loadArtifact("VolmexQuoteToken");
  const PerpetualOracle = await deployer.loadArtifact("PerpetualOracle");
  const VaultController = await deployer.loadArtifact("VaultController");
  const PositioningConfig = await deployer.loadArtifact("PositioningConfig");
  const AccountBalance = await deployer.loadArtifact("AccountBalance");
  const Positioning = await deployer.loadArtifact("Positioning");
  const Vault = await deployer.loadArtifact("Vault");
  const MarketRegistry = await deployer.loadArtifact("MarketRegistry");
  const VolmexPerpPeriphery = await deployer.loadArtifact("VolmexPerpPeriphery");
  const TestERC20 = await deployer.loadArtifact("TestERC20");
  const VolmexPerpView = await deployer.loadArtifact("VolmexPerpView");
  const networkDetail = await ethers.provider.getNetwork();
  const isArbitrum = arbitrumChainId.includes(networkDetail.chainId);
  // const deployed = await deployer.deploy(TestERC20, []);
  console.log("Deploying PerView ...");
  const perpView = await hre.zkUpgrades.deployProxy(deployer.zkWallet, VolmexPerpView, [
    owner.address,
  ]);
  console.log(perpView.address);
  await perpView.deployed();

  await (await perpView.grantViewStatesRole(owner.address)).wait();
  console.log("Deploying Base Token ...");
  const volmexBaseToken1 = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
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
  const volmexBaseToken2 = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
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

  const perpetualOracle = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
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
  console.log(perpetualOracle.address);
  await (await volmexBaseToken1.setPriceFeed(perpetualOracle.address)).wait();
  await (await volmexBaseToken2.setPriceFeed(perpetualOracle.address)).wait();

  if (process.env.INDEX_OBSERVATION_ADDER) {
    await (
      await perpetualOracle.setIndexObservationAdder(process.env.INDEX_OBSERVATION_ADDER)
    ).wait();
  }

  console.log("Deploying Quote Token ...");
  const volmexQuoteToken = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
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

  const usdt = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
    TestERC20,
    [`USDC Volmex Testnet`, `USDC`, 6],
    {
      initializer: "__TestERC20_init",
    },
  );
  console.log(usdt.address);

  console.log("Deploying MatchingEngine ...");
  const matchingEngine = await hre.zkUpgrades.deployProxy(deployer.zkWallet, MatchingEngine, [
    owner.address,
    perpetualOracle.address,
  ]);
  await matchingEngine.deployed();
  console.log(matchingEngine.address);

  await (await perpetualOracle.setMarkObservationAdder(matchingEngine.address)).wait();
  await (await perpetualOracle.setIndexObservationAdder(owner.address)).wait();
  console.log("Deploying Positioning Config ...");
  const positioningConfig = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
    PositioningConfig,
    [perpetualOracle.address],
  );

  await positioningConfig.deployed();
  console.log(positioningConfig.address);

  await (await perpetualOracle.grantSmaIntervalRole(positioningConfig.address)).wait();
  await positioningConfig.setMaxMarketsPerAccount(5);
  await positioningConfig.setSettlementTokenBalanceCap("10000000000000");

  console.log("Deploying Account Balance ...");
  const accountBalance = await hre.zkUpgrades.deployProxy(deployer.zkWallet, AccountBalance, [
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
  const vaultController = await hre.zkUpgrades.deployProxy(deployer.zkWallet, VaultController, [
    positioningConfig.address,
    accountBalance.address,
  ]);
  await vaultController.deployed();
  console.log(vaultController.address);
  const vaultControllerContract = new ContractFactory(
    VaultController.abi,
    VaultController.bytecode,
    deployer.zkWallet,
  );
  const vaultControllerTransactor = vaultControllerContract.attach(vaultController.address);
  await (await accountBalance.grantSettleRealizedPnlRole(vaultController.address)).wait();
  await (await perpView.setVaultController(vaultController.address)).wait();

  console.log("Deploying Vault ...");
  const vault = await hre.zkUpgrades.deployProxy(deployer.zkWallet, Vault, [
    positioningConfig.address,
    accountBalance.address,
    usdt.address,
    vaultController.address,
  ]);
  await vault.deployed();
  console.log(vault.address);
  await (await perpView.incrementVaultIndex()).wait();
  console.log("Deploying MarketRegistry ...");
  const marketRegistry = await hre.zkUpgrades.deployProxy(deployer.zkWallet, MarketRegistry, [
    volmexQuoteToken.address,
    [volmexBaseToken1.address, volmexBaseToken2.address],
  ]);
  await marketRegistry.deployed();
  console.log(marketRegistry.address);
  console.log("Deploying Positioning ...");
  const positioning = await hre.zkUpgrades.deployProxy(
    deployer.zkWallet,
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
  await (await vaultController.registerVault(vault.address, usdt.address)).wait();
  console.log("Set maker fee ...");
  await marketRegistry.setMakerFeeRatio("400");
  console.log("Set taker fee ...");
  await marketRegistry.setTakerFeeRatio("900");

  console.log("Deploying Periphery contract ...");
  const periphery = await hre.zkUpgrades.deployProxy(deployer.zkWallet, VolmexPerpPeriphery, [
    perpView.address,
    perpetualOracle.address,
    [vault.address, vault.address],
    owner.address,
    process.env.RELAYER ? process.env.RELAYER : owner.address,
  ]);
  await periphery.deployed();
  console.log(periphery.address);

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
    USDT: usdt.address,
    Deployer: await owner.getAddress(),
  };
  console.log("\n =====Deployment Successful===== \n");
  console.log(addresses);
  // const ethAfter = await provider.getBalance(owner.address);
  // console.log("ETH burned: ", ethBefore.sub(ethAfter).toString());

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
      address: usdt.address,
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

positioning(hardhat)
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
