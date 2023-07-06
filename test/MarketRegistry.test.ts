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
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let VolmexPerpView;
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
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    FundingRate = await ethers.getContractFactory("FundingRate");
    [owner, account1, account2] = await ethers.getSigners();
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
        [60000000, 60000000, 30750000000, 1800000000],
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
    await marketRegistry.grantAddBaseTokenRole(owner.address);
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
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
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
    await vaultController.setPeriphery(volmexPerpPeriphery.address);
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
            volmexBaseToken.address,
            volmexBaseToken.address,
            chainlinkBaseToken.address,
            chainlinkBaseToken2.address,
          ],
        ]),
      ).to.be.revertedWith("MR_QTNC");
    });
    it("should fail to initilaize again", async () => {
      await expect(
        marketRegistry.initialize(virtualToken.address, [
          volmexBaseToken.address,
          volmexBaseToken.address,
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
      const receipt = await marketRegistry.addBaseToken(volmexBaseToken.address);
      expect(receipt.value.toString()).to.be.equal("0");
    });

    it("should fail to  add base token is token is not base", async () => {
      await expect(marketRegistry.addBaseToken(virtualToken.address)).to.be.revertedWith(
        "MarketRegistry: not base token",
      );
    });

    it("should fail to add base tokens", async () => {
      await expect(
        marketRegistry.connect(account2).addBaseToken(volmexBaseToken.address),
      ).to.be.revertedWith("MarketRegistry: Not add base token role");
    });
  });
});
