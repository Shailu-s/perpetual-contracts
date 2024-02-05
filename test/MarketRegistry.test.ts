import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Market Registry", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let Positioning;
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
  let BaseToken;
  let BaseToken;
  let QuoteToken;
  let QuoteToken;
  let PerpPeriphery;
  let PerpPeriphery;
  let PerpView;
  let perpView;
  let accountBalance1;
  let chainlinkBaseToken;
  let chainlinkBaseToken2;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let MarketRegistry;
  let marketRegistry;
  let FundingRate;
  let fundingRate;
  let TestERC20;
  let USDC;
  let owner, account1, account2;
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585424";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585425";

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

  this.beforeAll(async () => {
    PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    Positioning = await ethers.getContractFactory("Positioning");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    BaseToken = await ethers.getContractFactory("BaseToken");
    QuoteToken = await ethers.getContractFactory("QuoteToken");
    PerpView = await ethers.getContractFactory("PerpView");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    FundingRate = await ethers.getContractFactory("FundingRate");
    [owner, account1, account2] = await ethers.getSigners();
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(PerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    BaseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    chainlinkBaseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    chainlinkBaseToken2 = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
    await (await perpView.setBaseToken(BaseToken.address)).wait();

    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 3048000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          BaseToken.address,
          BaseToken.address,
          chainlinkBaseToken.address,
          chainlinkBaseToken2.address,
        ],
        [60000000, 60000000, 30750000000, 1800000000],
        [60000000, 60000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
    await BaseToken.setPriceFeed(perpetualOracle.address);
    QuoteToken = await upgrades.deployProxy(
      QuoteToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await QuoteToken.deployed();
    await (await perpView.setQuoteToken(QuoteToken.address)).wait();

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
        BaseToken.address,
        BaseToken.address,
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
      QuoteToken.address,
      [
        BaseToken.address,
        BaseToken.address,
        chainlinkBaseToken.address,
        chainlinkBaseToken2.address,
      ],
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
        [
          BaseToken.address,
          BaseToken.address,
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
    await (await BaseToken.setMintBurnRole(positioning.address)).wait();
    await (await QuoteToken.setMintBurnRole(positioning.address)).wait();
    await marketRegistry.grantAddBaseTokenRole(owner.address);
    await marketRegistry.connect(owner).addBaseToken(BaseToken.address, 0);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("1000000000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await perpetualOracle.setFundingRate(fundingRate.address);
    await positioningConfig.setTwapInterval(28800);
    await perpetualOracle.grantCacheChainlinkPriceRole(owner.address);
    PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await PerpPeriphery.deployed();
    await vaultController.setPeriphery(PerpPeriphery.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
  });
  describe("Deploy", async () => {
    it("should successfully deploy", async () => {
      let receipt = await marketRegistry.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("should fail to deploy when quote token is not contract", async () => {
      await expect(
        upgrades.deployProxy(MarketRegistry, [
          ZERO_ADDR,
          [
            BaseToken.address,
            BaseToken.address,
            chainlinkBaseToken.address,
            chainlinkBaseToken2.address,
          ],
        ]),
      ).to.be.revertedWith("MR_QTNC");
    });
    it("should fail to initilaize again", async () => {
      await expect(
        marketRegistry.initialize(virtualToken.address, [
          BaseToken.address,
          BaseToken.address,
          chainlinkBaseToken.address,
          chainlinkBaseToken2.address,
        ]),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });
  describe("setters", async () => {
    it("should  fail to set taker fees ration", async () => {
      await expect(marketRegistry.setTakerFeeRatio("7000000")).to.be.revertedWith("MR_RO");
    });
    it("should  fail to set taker fees ration", async () => {
      await expect(marketRegistry.setMakerFeeRatio("7000000")).to.be.revertedWith("MR_RO");
    });
    it("should set max order per market", async () => {
      await marketRegistry.setMaxOrdersPerMarket("125");
      const maxOrderPerpMarket = await marketRegistry.getMaxOrdersPerMarket();
      expect(maxOrderPerpMarket.toString()).to.be.equal("125");
    });
    it("should fail set max order oper market", async () => {
      await expect(
        marketRegistry.connect(account2).setMaxOrdersPerMarket("125"),
      ).to.be.revertedWith("MarketRegistry: Not admin");
    });
    it("should set positioning", async () => {
      await marketRegistry.setPositioning(account1.address);
      const positioning = await marketRegistry.getPositioning();
      expect(positioning).to.be.equal(account1.address);
    });
    it("should fail to set positioning", async () => {
      await expect(
        marketRegistry.connect(account2).setPositioning(account1.address),
      ).to.be.revertedWith("PositioningCallee: Not admin");
    });
    it("should not add base token if already added", async () => {
      const receipt = await marketRegistry.addBaseToken(BaseToken.address, 0);
      expect(receipt.value.toString()).to.be.equal("0");
    });

    it("should fail to  add base token is token is not base", async () => {
      await expect(marketRegistry.addBaseToken(virtualToken.address, 0)).to.be.revertedWith(
        "MarketRegistry: not base token",
      );
    });

    it("should fail to add base tokens", async () => {
      await expect(
        marketRegistry.connect(account2).addBaseToken(BaseToken.address, 0),
      ).to.be.revertedWith("MarketRegistry: Not add base token role");
    });
  });
});
