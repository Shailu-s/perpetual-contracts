import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("./order");

describe("Multiple protocols", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let Positioning;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let positioning;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let PerpetualOracle;
  let perpetualOracle;
  let EVIV;
  let BVIV;
  let VolmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let VolmexPerpView;
  let perpView;
  let chainlinkBaseToken;
  let chainlinkBaseToken2;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let FundingRate;
  let fundingRate;
  let TestERC20;
  let USDC;
  let owner, account1, account2, account3, account4, alice, bob;
  let liquidator;
  const deadline = 87654321987654;
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585424";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585425";
  const ORDER = "0xf555eb98";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    Positioning = await ethers.getContractFactory("Positioning");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    TestERC20 = await ethers.getContractFactory("TetherToken");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    FundingRate = await ethers.getContractFactory("FundingRate");
    [owner, account1, account2, account3, account4, alice, bob] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    EVIV = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "Ethereum Volmex Implied Volatility Index", // nameArg
        "EVIV", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await EVIV.deployed();
    BVIV = await upgrades.deployProxy(
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
    await EVIV.deployed();
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

    await (await perpView.setBaseToken(EVIV.address)).wait();
    await (await perpView.setBaseToken(BVIV.address)).wait();

    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 3048000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [EVIV.address, BVIV.address, chainlinkBaseToken.address, chainlinkBaseToken2.address],
        [60000000, 50000000, 3075000000000, 1800000000],
        [70000000, 55000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
    await EVIV.setPriceFeed(perpetualOracle.address);
    await BVIV.setPriceFeed(perpetualOracle.address);
    volmexQuoteToken = await upgrades.deployProxy(
      VolmexQuoteToken,
      [
        "VolmexQuoteToken", // nameArg
        "VUSDT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexQuoteToken.deployed();
    await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);

    USDC = await TestERC20.deploy("100000000000000000000000", "Tether USD", "USDT", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [EVIV.address, BVIV.address, chainlinkBaseToken.address, chainlinkBaseToken2.address],
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
      [EVIV.address, BVIV.address, chainlinkBaseToken.address, chainlinkBaseToken2.address],
      [0, 1, chainlinkTokenIndex1, chainlinkTokenIndex2],
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
        [EVIV.address, BVIV.address, chainlinkBaseToken.address, chainlinkBaseToken2.address],
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
    await (await EVIV.setMintBurnRole(positioning.address)).wait();
    await (await BVIV.setMintBurnRole(positioning.address)).wait();

    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();
    await marketRegistry.grantAddBaseTokenRole(owner.address);
    await marketRegistry.connect(owner).addBaseToken(EVIV.address);
    await marketRegistry.connect(owner).addBaseToken(BVIV.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await perpetualOracle.setFundingRate(fundingRate.address);
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.connect(owner).setTwapInterval(28800);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("100000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await perpetualOracle.setPositioning(positioning.address)).wait();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.toggleTraderWhitelistEnabled();
    await volmexPerpPeriphery.deployed();
    await vaultController.setPeriphery(volmexPerpPeriphery.address);
    await (await USDC.transfer(account1.address, "10000000000")).wait();
    await (await USDC.transfer(account2.address, "10000000000")).wait();
    await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
    await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");

    await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "10000000000");
    await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "10000000000");
    await volmexPerpPeriphery.whitelistTrader(account1.address, true);
    await volmexPerpPeriphery.whitelistTrader(account2.address, true);
  });
  describe("trader should be able to trade with both protocols", async () => {
    it("should trade only in EVIV", async () => {
      const indexPrice = await perpetualOracle.latestIndexPrice(0);
      expect(indexPrice.toString()).to.be.equal("70000000");
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(EVIV.address, "10000000000000000000"),
        Asset(volmexQuoteToken.address, "700000000000000000000"),
        89,
        0,
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexQuoteToken.address, "700000000000000000000"),
        Asset(EVIV.address, "10000000000000000000"),
        987,
        0,
        false,
      );
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        ),
      ).to.emit(positioning, "PositionChanged");

      const lastMarkPriceAdded = await perpetualOracle.latestMarkPrice(0);
      expect(lastMarkPriceAdded.toString()).to.be.equal("70000000");
      const traderEVIVSize = await accountBalance1.getPositionSize(account2.address, EVIV.address);
      expect(traderEVIVSize.toString()).to.be.equal("10000000000000000000");
      const traderBVIVSize = await accountBalance1.getPositionSize(account2.address, BVIV.address);
      expect(traderBVIVSize.toString()).to.be.equal("0");
    });
    it("should trade only in BVIV", async () => {
      const indexPrice = await perpetualOracle.latestIndexPrice(1);
      expect(indexPrice.toString()).to.be.equal("55000000");
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(BVIV.address, "10000000000000000000"),
        Asset(volmexQuoteToken.address, "600000000000000000000"),
        89,
        0,
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexQuoteToken.address, "600000000000000000000"),
        Asset(BVIV.address, "10000000000000000000"),
        987,
        0,
        false,
      );
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        ),
      ).to.emit(positioning, "PositionChanged");

      const lastMarkPriceAdded = await perpetualOracle.latestMarkPrice(1);
      expect(lastMarkPriceAdded.toString()).to.be.equal("55000000");
      const traderPositionSizeBVIV = await accountBalance1.getPositionSize(
        account2.address,
        BVIV.address,
      );
      expect(traderPositionSizeBVIV.toString()).to.be.equal("10000000000000000000");
      const traderPositionSizeEVIV = await accountBalance1.getPositionSize(
        account2.address,
        EVIV.address,
      );
      expect(traderPositionSizeEVIV.toString()).to.be.equal("0");
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
