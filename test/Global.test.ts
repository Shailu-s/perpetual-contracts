import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("./order");
import { BigNumber } from "ethers";

describe("Global", function () {
  let owner;
  let account1, account2;
  let MatchingEngine;
  let PerpFactory;
  let VolmexBaseToken;
  let VolmexQuoteToken;
  let MarkPriceOracle;
  let IndexPriceOracle;
  let VaultController;
  let PositioningConfig;
  let AccountBalance;
  let Positioning;
  let Vault;
  let MarketRegistry;
  let VolmexPerpPeriphery;
  let TestERC20;
  let indexPriceOracle;
  let volmexBaseToken;
  let volmexQuoteToken;
  let markPriceOracle;
  let usdc;
  let positioningConfig;
  let accountBalance;
  let vaultController;
  let vaultController2;
  let vault;
  let positioning;
  let positioning2;
  let marketRegistry;
  let periphery;
  let factory;
  let matchingEngine;
  let orderLeft, orderRight;
  let liquidator;

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const three = ethers.constants.WeiPerEther.mul(BigNumber.from("3")); // 2e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 2e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10")); // 2e18
  const seven = ethers.constants.WeiPerEther.mul(BigNumber.from("7")); // 2e18
  const nine = ethers.constants.WeiPerEther.mul(BigNumber.from("9")); // 2e18
  const deadline = 87654321987654;

  this.beforeAll(async () => {
    [owner, account1, account2] = await ethers.getSigners();
    console.log("Deployer: ", await owner.getAddress());
    console.log("Balance: ", (await owner.getBalance()).toString());
    liquidator = encodeAddress(owner.address);

    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    PerpFactory = await ethers.getContractFactory("PerpFactory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    VaultController = await ethers.getContractFactory("VaultController");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    Positioning = await ethers.getContractFactory("Positioning");
    Vault = await ethers.getContractFactory("Vault");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    TestERC20 = await ethers.getContractFactory("TestERC20");
  });

  this.beforeEach(async () => {
    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
      initializer: "initialize",
    });
    await indexPriceOracle.deployed();

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();

    volmexQuoteToken = await upgrades.deployProxy(
      VolmexQuoteToken,
      [
        "VolmexQuoteToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexQuoteToken.deployed();

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[1000000], [volmexBaseToken.address]],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    usdc = await upgrades.deployProxy(TestERC20, ["VolmexUSDC", "VUSDC", 6], {
      initializer: "__TestERC20_init",
    });
    await usdc.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      markPriceOracle.address,
    ]);
    await matchingEngine.deployed();
    await (await markPriceOracle.setMatchingEngine(matchingEngine.address)).wait();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, []);
    await positioningConfig.deployed();
    await positioningConfig.setMaxMarketsPerAccount(5);
    await positioningConfig.setSettlementTokenBalanceCap("1000000000000000000");

    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();

    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance.address,
    ]);
    await vaultController.deployed();
    vaultController2 = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance.address,
    ]);
    await vaultController2.deployed();

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      usdc.address,
      vaultController.address,
      false,
    ]);

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    positioning2 = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController2.address,
        accountBalance.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning2.deployed();

    marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);
    await marketRegistry.deployed();
    await (await marketRegistry.addBaseToken(volmexBaseToken.address)).wait();
    await (await positioning.setMarketRegistry(marketRegistry.address)).wait();
    await (await positioning.setDefaultFeeReceiver(owner.address)).wait();
    await (await positioning2.setMarketRegistry(marketRegistry.address)).wait();
    await (await positioning2.setDefaultFeeReceiver(owner.address)).wait();
    await (await vaultController.setPositioning(positioning.address)).wait();
    await (await vaultController.registerVault(vault.address, usdc.address)).wait();
    await (await vaultController2.setPositioning(positioning.address)).wait();
    await (await vaultController2.registerVault(vault.address, usdc.address)).wait();
    await (await accountBalance.setPositioning(positioning.address)).wait();

    periphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      [positioning.address, positioning2.address],
      [vaultController.address, vaultController2.address],
      markPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with relayer
    ]);
    await periphery.deployed();

    const proxyAdmin = await upgrades.admin.getInstance();
    factory = await upgrades.deployProxy(
      PerpFactory,
      [
        await proxyAdmin.getProxyImplementation(volmexBaseToken.address),
        await proxyAdmin.getProxyImplementation(volmexQuoteToken.address),
        await proxyAdmin.getProxyImplementation(vaultController.address),
        await proxyAdmin.getProxyImplementation(vault.address),
        await proxyAdmin.getProxyImplementation(positioning.address),
        await proxyAdmin.getProxyImplementation(accountBalance.address),
      ],
      {
        initializer: "initialize",
      },
    );
    await factory.deployed();
  });

  it("should match orders and open position", async () => {
    const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

    await matchingEngine.grantMatchOrders(positioning.address);

    await usdc.connect(owner).mint(account1.address, "1000000000000000");
    await usdc.connect(owner).mint(account2.address, "1000000000000000");

    await usdc.connect(account1).approve(periphery.address, "1000000000000000");
    await usdc.connect(account2).approve(periphery.address, "1000000000000000");

    await periphery.connect(account1).depositToVault(0, usdc.address, "10000000000");
    await periphery.connect(account2).depositToVault(0, usdc.address, "10000000000");

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexQuoteToken.address, one.toString()),
      Asset(volmexBaseToken.address, two.toString()),
      5,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(volmexQuoteToken.address, one.toString()),
      6,
      0,
      true,
    );

    let signatureLeft = await getSignature(orderLeft, account1.address);
    let signatureRight = await getSignature(orderRight, account2.address);

    // left 1, 2
    // right 2, 1
    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    let positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.takeAsset.virtualToken,
    );
    let positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.takeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.takeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.takeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);
    console.log("Another call \n");

    expect(positionSize).to.be.equal("2000000000000000000");
    expect(positionSize1).to.be.equal("-2000000000000000000");

    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

    for (let index = 0; index < 10; index++) {
      await (
        await indexPriceOracle.updateBatchVolatilityTokenPrice(
          [0, 1],
          [200000000, 200000000],
          [proofHash, proofHash],
        )
      ).wait();
    }

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, three.toString()),
      Asset(volmexQuoteToken.address, one.toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, one.toString()),
      Asset(volmexBaseToken.address, three.toString()),
      2,
      0,
      false,
    );

    signatureLeft = await getSignature(orderLeft, account1.address);
    signatureRight = await getSignature(orderRight, account2.address);

    // left 1, 2
    // right 2, 1
    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);
    console.log("Another call \n");

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, three.toString()),
      Asset(volmexQuoteToken.address, two.toString()),
      3,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, two.toString()),
      Asset(volmexBaseToken.address, three.toString()),
      4,
      0,
      false,
    );

    signatureLeft = await getSignature(orderLeft, account1.address);
    signatureRight = await getSignature(orderRight, account2.address);

    // left 1, 2
    // right 2, 1
    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);
  });

  it("should match orders and open position", async () => {
    const index = await markPriceOracle.indexByBaseToken(volmexBaseToken.address);
    let observations = await markPriceOracle.getCumulativePrice(3600, index);
    console.log("observations", observations.toString());

    await matchingEngine.grantMatchOrders(positioning.address);

    await usdc.connect(owner).mint(account1.address, "1000000000000000");
    await usdc.connect(owner).mint(account2.address, "1000000000000000");

    await usdc.connect(account1).approve(periphery.address, "1000000000000000");
    await usdc.connect(account2).approve(periphery.address, "1000000000000000");

    await periphery.connect(account1).depositToVault(0, usdc.address, "10000000000");
    await periphery.connect(account2).depositToVault(0, usdc.address, "10000000000");

    // Both partial filled {5, 2} {3, 1}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexQuoteToken.address, five.toString()),
      Asset(volmexBaseToken.address, two.toString()),
      1,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, three.toString()),
      Asset(volmexQuoteToken.address, one.toString()),
      1,
      0,
      true,
    );

    let signatureLeft = await getSignature(orderLeft, account1.address);
    let signatureRight = await getSignature(orderRight, account2.address);

    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    let positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.takeAsset.virtualToken,
    );
    let positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.takeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.takeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.takeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);

    observations = await markPriceOracle.getCumulativePrice(3600, index);
    console.log("observations", observations.toString());
    console.log("Another call \n");

    expect(positionSize).to.be.equal("400000000000000000");
    expect(positionSize1).to.be.equal("-400000000000000000");

    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

    for (let index = 0; index < 10; index++) {
      await (
        await indexPriceOracle.updateBatchVolatilityTokenPrice(
          [0, 1],
          [200000000, 200000000],
          [proofHash, proofHash],
        )
      ).wait();
    }

    // both partially filled {2, 3} {2, 1}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(volmexQuoteToken.address, three.toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, two.toString()),
      Asset(volmexBaseToken.address, one.toString()),
      2,
      0,
      false,
    );

    signatureLeft = await getSignature(orderLeft, account1.address);
    signatureRight = await getSignature(orderRight, account2.address);

    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);

    observations = await markPriceOracle.getCumulativePrice(3600, index);
    console.log("observations", observations.toString());
    console.log("Another call \n");

    // right partially filled {2, 1} {2, 3}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(volmexQuoteToken.address, one.toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, two.toString()),
      Asset(volmexBaseToken.address, three.toString()),
      2,
      0,
      false,
    );

    signatureLeft = await getSignature(orderLeft, account1.address);
    signatureRight = await getSignature(orderRight, account2.address);

    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");

    positionSize = await accountBalance.getTakerPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance.getTakerPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance.getTakerOpenNotional(
            account1.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance.getTakerOpenNotional(
            account2.address,
            orderLeft.makeAsset.virtualToken,
          )
        ).toString(),
      ],
    ]);

    observations = await markPriceOracle.getCumulativePrice(3600, index);
    console.log("observations", observations.toString());
  });

  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
