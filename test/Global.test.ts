import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("./order");
import { BigNumber } from "ethers";

describe("Global", function () {
  let owner;
  let account1, account2;
  let MatchingEngine;
  let VolmexBaseToken;
  let USDC;
  let virtualToken;
  let VolmexQuoteToken;
  let PerpetualOracle;
  let perpetualOracle;
  let VaultController;
  let PositioningConfig;
  let AccountBalance;
  let Positioning;
  let Vault;
  let MarketRegistry;
  let VolmexPerpPeriphery;
  let VolmexPerpView;
  let TestERC20;
  let volmexBaseToken;
  let volmexQuoteToken;
  let positioningConfig;
  let accountBalance1;
  let vaultController;
  let vault;
  let positioning;
  let marketRegistry;
  let periphery;
  let perpView;
  let chainlinkBaseToken;
  let chainlinkBaseToken2;
  let ChainLinkAggregator;
  let matchingEngine;
  let orderLeft, orderRight;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let FundingRate;
  let fundingRate;
  let liquidator;
  let VirtualToken;
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585424";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585425";
  const ORDER = "0xf555eb98";
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const three = ethers.constants.WeiPerEther.mul(BigNumber.from("3")); // 2e18
  const deadline = 87654321987654;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

  this.beforeAll(async () => {
    [owner, account1, account2] = await ethers.getSigners();
    console.log("Deployer: ", await owner.getAddress());
    console.log("Balance: ", (await owner.getBalance()).toString());
    liquidator = encodeAddress(owner.address);

    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    VaultController = await ethers.getContractFactory("VaultController");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    Positioning = await ethers.getContractFactory("Positioning");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    Vault = await ethers.getContractFactory("Vault");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    FundingRate = await ethers.getContractFactory("FundingRate");
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    chainlinkBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    chainlinkBaseToken2 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();
    await (await perpView.setBaseToken(volmexBaseToken.address)).wait();

    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 3048000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          volmexBaseToken.address,
          volmexBaseToken.address,
          chainlinkBaseToken.address,
          chainlinkBaseToken2.address,
        ],
        [60000000, 60000000, 3075000000000, 1800000000],
        [60000000, 60000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    volmexQuoteToken = await upgrades.deployProxy(
      VolmexQuoteToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexQuoteToken.deployed();
    await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        volmexBaseToken.address,
        volmexBaseToken.address,
        chainlinkBaseToken.address,
        chainlinkBaseToken2.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    await accountBalance1.deployed();
    await (await perpView.setAccount(accountBalance1.address)).wait();
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    await vaultController.deployed();
    await (await perpView.setVaultController(vaultController.address)).wait();

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);
    await vault.deployed();
    await (await perpView.incrementVaultIndex()).wait();

    (await accountBalance1.grantSettleRealizedPnlRole(vault.address)).wait();
    (await accountBalance1.grantSettleRealizedPnlRole(vaultController.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      volmexQuoteToken.address,
      [
        volmexBaseToken.address,
        volmexBaseToken.address,
        chainlinkBaseToken.address,
        chainlinkBaseToken2.address,
      ],
    ]);
    fundingRate = await upgrades.deployProxy(
      FundingRate,
      [perpetualOracle.address, positioningConfig.address, accountBalance1.address, owner.address],
      {
        initializer: "FundingRate_init",
      },
    );
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        fundingRate.address,
        marketRegistry.address,
        [
          volmexBaseToken.address,
          volmexBaseToken.address,
          chainlinkBaseToken.address,
          chainlinkBaseToken2.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, account1.address],
        ["10000000000000000000", "10000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();

    await (await perpView.setPositioning(positioning.address)).wait();
    await (await perpView.incrementPerpIndex()).wait();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

    await (await positioning.setMarketRegistry(marketRegistry.address)).wait();
    await (await positioning.setDefaultFeeReceiver(owner.address)).wait();
    await (await vaultController.setPositioning(positioning.address)).wait();
    await (await vaultController.registerVault(vault.address, USDC.address)).wait();
    await (await accountBalance1.setPositioning(positioning.address)).wait();
    await (await perpetualOracle.setFundingRate(fundingRate.address)).wait();

    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);
    await perpetualOracle.setMarkObservationAdder(owner.address);
    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await perpetualOracle.setIndexObservationAdder(matchingEngine.address);

    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("1000000000000000000000000000000000000000");

    periphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with relayer
    ]);
    await periphery.deployed();
  });

  it("should match orders and open position", async () => {
    await matchingEngine.grantMatchOrders(positioning.address);

    await USDC.connect(owner).mint(account1.address, "10000000000000000000");
    await USDC.connect(owner).mint(account2.address, "10000000000000000000");

    await USDC.connect(account1).approve(periphery.address, "10000000000000000000");
    await USDC.connect(account2).approve(periphery.address, "10000000000000000000");
    await periphery.connect(account1).depositToVault(0, USDC.address, "10000000000000000000");
    await periphery.connect(account2).depositToVault(0, USDC.address, "10000000000000000000");

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      Asset(volmexBaseToken.address, "10000000000000000000"),
      5,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, "10000000000000000000"),
      Asset(volmexQuoteToken.address, "10000000000000000000"),
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
    console.log("here");
    let positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.takeAsset.virtualToken,
    );
    let positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.takeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.takeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.takeAsset.virtualToken)
        ).toString(),
      ],
    ]);
    console.log("Another call \n");

    expect(positionSize).to.be.equal("10000000000000000000");
    expect(positionSize1).to.be.equal("-10000000000000000000");

    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
    for (let index = 0; index < 10; index++) {
      await (await perpetualOracle.addIndexObservations([0], [100000000], [proofHash])).wait();
      await (await perpetualOracle.addIndexObservations([1], [100000000], [proofHash])).wait();
    }

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, "10000000000000000000"),
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      Asset(volmexBaseToken.address, "10000000000000000000"),
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

    positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
    ]);
    console.log("Another call \n");

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, "10000000000000000000"),
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      3,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      Asset(volmexBaseToken.address, "10000000000000000000"),
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

    positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
    ]);
  });

  it("should match orders and open position2", async () => {
    const index = await perpetualOracle.indexByBaseToken(volmexBaseToken.address);

    await matchingEngine.grantMatchOrders(positioning.address);

    await USDC.connect(owner).mint(account1.address, "10000000000000000000");
    await USDC.connect(owner).mint(account2.address, "10000000000000000000");

    await USDC.connect(account1).approve(periphery.address, "10000000000000000000");
    await USDC.connect(account2).approve(periphery.address, "10000000000000000000");

    await periphery.connect(account1).depositToVault(0, USDC.address, "10000000000000000000");
    await periphery.connect(account2).depositToVault(0, USDC.address, "10000000000000000000");

    // Both partial filled {5, 2} {3, 1}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexQuoteToken.address, "5000000000000000000"),
      Asset(volmexBaseToken.address, "20000000000000000000"),
      1,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, "30000000000000000000"),
      Asset(volmexQuoteToken.address, "1000000000000000000"),
      1,
      0,
      true,
    );

    let signatureLeft = await getSignature(orderLeft, account1.address);
    let signatureRight = await getSignature(orderRight, account2.address);

    await expect(
      positioning
        .connect(account1)
        .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
    ).to.emit(positioning, "PositionChanged");

    let positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.takeAsset.virtualToken,
    );
    let positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.takeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.takeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.takeAsset.virtualToken)
        ).toString(),
      ],
    ]);

    let observations = await perpetualOracle.lastestLastPriceSMA(index, 3600);
    console.log("observations", observations.toString());
    console.log("Another call \n");

    expect(positionSize).to.be.equal("20000000000000000000");
    expect(positionSize1).to.be.equal("-20000000000000000000");

    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
    for (let index = 0; index < 10; index++) {
      await (await perpetualOracle.addIndexObservations([0], [100000000], [proofHash])).wait();
      await (await perpetualOracle.addIndexObservations([1], [100000000], [proofHash])).wait();
    }

    // both partially filled {2, 3} {2, 1}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, "20000000000000000000"),
      Asset(volmexQuoteToken.address, "300000000000000000000"),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, "200000000000000000000"),
      Asset(volmexBaseToken.address, "10000000000000000000"),
      2,
      0,
      false,
    );

    signatureLeft = await getSignature(orderLeft, account1.address);
    signatureRight = await getSignature(orderRight, account2.address);

    await expect(
      positioning
        .connect(account1)
        .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
    ).to.emit(positioning, "PositionChanged");

    positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
    ]);

    observations = await perpetualOracle.lastestLastPriceSMA(index, 3600);
    console.log("observations", observations.toString());

    console.log("Another call \n");

    // right partially filled {2, 1} {2, 3}
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, "20000000000000000000"),
      Asset(volmexQuoteToken.address, "10000000000000000000"),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexQuoteToken.address, "20000000000000000000"),
      Asset(volmexBaseToken.address, "30000000000000000000"),
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

    positionSize = await accountBalance1.getPositionSize(
      account1.address,
      orderLeft.makeAsset.virtualToken,
    );
    positionSize1 = await accountBalance1.getPositionSize(
      account2.address,
      orderLeft.makeAsset.virtualToken,
    );
    console.table([
      ["positionSize", positionSize.toString()],
      [
        "open notional",
        (
          await accountBalance1.getOpenNotional(account1.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
      ["", ""],
      ["positionSize 1", positionSize1.toString()],
      [
        "open notional 1",
        (
          await accountBalance1.getOpenNotional(account2.address, orderLeft.makeAsset.virtualToken)
        ).toString(),
      ],
    ]);

    observations = await perpetualOracle.lastestLastPriceSMA(index, 3600);
    console.log("observations", observations.toString());
  });

  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
