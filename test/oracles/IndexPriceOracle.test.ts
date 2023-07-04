import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

const { encodeAddress } = require("../order");
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("PerpetualOracle - Index Price Oracle", function () {
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
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let accountBalance1;
  let chainlinkBaseToken;
  let chainlinkBaseToken2;
  let MarketRegistry;
  let marketRegistry;
  let TestERC20;
  let USDC;
  let owner, account1;
  let liquidator;
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585424";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792008524463585425";
  const epochTimeSeconds = 28800;

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
    [owner, account1] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
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
        [60000000, 60000000, 300000000000, 1800000000],
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
    await accountBalance1.grantAddUnderlyingIndexRole(owner.address);
    await accountBalance1.grantAddUnderlyingIndexRole(perpetualOracle.address);
    await accountBalance1.grantSigmaVivRole(perpetualOracle.address);

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

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
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
    await marketRegistry.grantAddBaseTokenRole(perpetualOracle.address);
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
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await perpetualOracle.setPositioning(positioning.address);
    await perpetualOracle.setAccountBalance(accountBalance1.address);
    await perpetualOracle.setMarketRegistry(marketRegistry.address);
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
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await perpetualOracle.setMarkObservationAdder(owner.address);
  });
  describe("Epoch", () => {
    it("Should calculate average price", async () => {
      await time.increase(epochTimeSeconds * 2);
      let sum = 0;
      let index;
      for (index = 0; index < 10; ++index) {
        await (
          await perpetualOracle.addIndexObservations(
            [0],
            [100000000 + index * 1000000],
            [proofHash],
          )
        ).wait();
        sum += 100000000 + index * 1000000;
      }
      const priceCumulative = sum / index;
      expect((await perpetualOracle.latestIndexSMA(28800, 0)).answer.toString()).equal(
        priceCumulative.toString(),
      );
    });
  });

  describe("Setters and getters", () => {
    it("Should fetch lastest index", async () => {
      await (await perpetualOracle.addIndexObservations([0], [76000000], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect((await perpetualOracle.latestIndexPrice(0)).toString()).equal("76000000");
    });

    it("Should fetch lastest prices", async () => {
      await (
        await perpetualOracle.addIndexObservations(
          [0, 1],
          [76000000, 76000000],
          [proofHash, proofHash],
        )
      ).wait();
      await time.increase(epochTimeSeconds);
      let prices = await perpetualOracle.getLatestBaseTokenPrice([0, 1]);
      expect(prices[0].indexPrice.toString()).equal("76000000");
      expect(prices[0].markPrice.toString()).equal("60000000");
      expect(prices[0].lastPrice.toString()).equal("60000000");
      expect(prices[1].indexPrice.toString()).equal("76000000");
      expect(prices[1].markPrice.toString()).equal("60000000");
      expect(prices[1].lastPrice.toString()).equal("60000000");
    });
  });

  describe("Deployment", function () {
    it("Should deploy volmex oracle", async () => {
      const receipt = await perpetualOracle.deployed();
      expect(receipt.confirmations).not.equal(0);
    });

    it("Should fail to initialize again ", async () => {
      await expectRevert(
        perpetualOracle.__PerpetualOracle_init(
          [
            volmexBaseToken.address,
            volmexBaseToken.address,
            chainlinkBaseToken.address,
            chainlinkBaseToken2.address,
          ],

          [60000000, 60000000, 300000000000, 1800000000],
          [60000000, 60000000],
          [proofHash, proofHash],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [chainlinkAggregator1.address, chainlinkAggregator2.address],
          owner.address,
        ),
        "Initializable: contract is already initialized",
      );
    });
  });

  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
      }

      const txn = await perpetualOracle.latestIndexSMA(10000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(perpetualOracle.addIndexObservations([0], [0], [proofHash])).to.be.revertedWith(
        "PerpOracle: zero price",
      );
    });
    it("Should fail to add observation when caller is not observation adder", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).addIndexObservations([1000000], [0], [proofHash]),
      ).to.be.revertedWith("PerpOracle: not index observation adder");
    });

    it("Should get cumulative price", async () => {
      await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);

      const txn = await perpetualOracle.latestIndexSMA(10000000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("Should latest round data", async () => {
      await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
      await time.increase(10000);

      const txn = await perpetualOracle.latestIndexSMA(10000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("Should get cumulative price with time delay", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        perpetualOracle.latestIndexSMA(1000, 0),
        perpetualOracle.latestIndexSMA(2000, 0),
        perpetualOracle.latestIndexSMA(3000, 0),
        perpetualOracle.latestIndexSMA(4000, 0),
        perpetualOracle.latestIndexSMA(5000, 0),
        perpetualOracle.latestIndexSMA(6000, 0),
        perpetualOracle.latestIndexSMA(7000, 0),
        perpetualOracle.latestIndexSMA(8000, 0),
        perpetualOracle.latestIndexSMA(9000, 0),
        perpetualOracle.latestIndexSMA(10000, 0),
        perpetualOracle.latestIndexSMA(20000, 0),
      ]);
      txns.forEach(txn => {
        expect(Number(txn.answer)).equal(10000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await perpetualOracle.latestIndexSMA(20000, 0);
      expect(Number(txn1.answer)).equal(60000000);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await perpetualOracle.latestIndexSMA(200, 0);
      expect(Number(txn2.answer)).equal(0);
      const txn3 = await perpetualOracle.latestIndexSMA(200000, 0);
      expect(Number(txn3.answer)).equal(10000000);
    });

    it("should return 0 price when no epoch is added", async () => {
      const currentTimeStamp = parseInt(await time.latest());
      const price = await perpetualOracle.getIndexEpochSMA(
        0,
        currentTimeStamp,
        currentTimeStamp + 10000,
      );
      expect(price.toString()).to.be.equal("0");
    });
    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await perpetualOracle.latestIndexSMA(20, 0);
      expect(Number(txn1.answer)).equal(60000000);

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [20000000], [proofHash]);
        await time.increase(1000);
      }
      const txn2 = await perpetualOracle.latestIndexSMA(9000, 0);
      expect(Number(txn2.answer)).equal(20000000);
    });
    it("should revert when tw interval  is zero", async () => {
      const timestamp = parseInt(await time.latest());
      await expect(perpetualOracle.latestIndexSMA(0, 0)).to.be.revertedWith(
        "PerpOracle: invalid timestamp",
      );
    });
    it("should revert when endtime stamp < start  ", async () => {
      const timestamp = parseInt(await time.latest());
      await expect(
        perpetualOracle.getIndexEpochSMA(0, timestamp, timestamp - 7000),
      ).to.be.revertedWith("PerpOracle: invalid timestamp");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).setIndexObservationAdder(account1.address),
      ).to.be.revertedWith("PerpOracle: not admin");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(perpetualOracle.setIndexObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "PerpOracle: zero address",
      );
    });
    it("should return zero when  the start time stamp is less than last time stamp", async () => {
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.addMarkObservation(0, 70000000);
      for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
          await perpetualOracle.addIndexObservations([0], [65000000], [proofHash]);
        }
        time.increase(28000);
        console.log((await perpetualOracle.indexEpochs(0, i != 0 ? i - 1 : 0)).toString());
      }
      console.log("Totalepochs", (await perpetualOracle.indexPriceEpochsCount(0)).toString());

      for (let i = 0; i < 2; i++) {
        await perpetualOracle.addMarkObservation(0, 70000000 * (i + 1));
        await time.increase(28800);
      }
      const timestamp = await time.latest();
      const lastEpochIndexPrice = await perpetualOracle.getIndexEpochSMA(
        0,
        parseInt(timestamp) + 20000,
        parseInt(timestamp) + 28800,
      );
      expect(lastEpochIndexPrice.toString()).to.equal("0");
    });
  });
  describe("Chainlink tokens test", async () => {
    it("Chainlink base tokens shoul be added correctly", async () => {
      const baseTokenByIndex1 = await perpetualOracle.baseTokenByIndex(chainlinkTokenIndex1);
      expect(baseTokenByIndex1).to.be.equal(chainlinkBaseToken.address);
      const aggregatorByIndex1 = await perpetualOracle.chainlinkAggregatorByIndex(
        chainlinkTokenIndex1,
      );
      expect(aggregatorByIndex1).to.be.equal(chainlinkAggregator1.address);
      const baseTokenByIndex2 = await perpetualOracle.baseTokenByIndex(chainlinkTokenIndex2);
      expect(baseTokenByIndex2).to.be.equal(chainlinkBaseToken2.address);
      const aggregatorByIndex2 = await perpetualOracle.chainlinkAggregatorByIndex(
        chainlinkTokenIndex2,
      );
      expect(aggregatorByIndex2).to.be.equal(chainlinkAggregator2.address);
    });
    it("should cache observation for chainlink token and give latest price SMA", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "30000000004546",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      const cacheIndexPrice = await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await cacheIndexPrice.wait();
      const chainlinkTokenPriceCached = await perpetualOracle.latestIndexSMA(
        200,
        chainlinkTokenIndex1,
      );
      expect(chainlinkTokenPriceCached.answer.toString()).to.be.equal("300000000045");
    });
    it("should fetch latest price from aggregator", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "39099003902399",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      const cacheIndexPrice = await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await cacheIndexPrice.wait();
      const latestIndexPrice = await perpetualOracle.latestIndexPrice(chainlinkTokenIndex1);
      expect(latestIndexPrice.toString()).to.be.equal("390990039023");
    });
    it("should fetch 0 epoch price", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "30000000000000",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await chainlinkAggregator1.updateRoundData(
        "162863638383903",
        "40000000000000",
        parseInt(currentTimestamp) + 1,
        parseInt(currentTimestamp) + 1,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      // Since there are no mark price observation added epoch price will come out to be 0
      const currentEpochPrice = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 28800,
      );
      expect(currentEpochPrice.toString()).to.be.equal("0");
    });
    it("should revert when accountdo have ha cache role to add chainlonk observation", async () => {
      const currentTimestamp = await time.latest();

      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "30000000000000",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      await expect(
        perpetualOracle.connect(account1).cacheChainlinkPrice(chainlinkTokenIndex1),
      ).to.be.revertedWith("PerpOracle: not chain link price adder");
    });
    it("should fetch epoch price", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "30000000000000",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await chainlinkAggregator1.updateRoundData(
        "162863638383903",
        "40000000000000",
        parseInt(currentTimestamp) + 1,
        parseInt(currentTimestamp) + 1,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      // Since there are no mark price observation added epoch price will come out to be 0
      const currentEpochPrice = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 28800,
      );
      expect(currentEpochPrice.toString()).to.be.equal("0");
      await perpetualOracle.addMarkObservation(chainlinkTokenIndex1, 300000000000);
      await chainlinkAggregator1.updateRoundData(
        "162863638383905",
        "30000000000000",
        parseInt(currentTimestamp) + 2,
        parseInt(currentTimestamp) + 2,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await chainlinkAggregator1.updateRoundData(
        "162863638383906",
        "40000000000000",
        parseInt(currentTimestamp) + 3,
        parseInt(currentTimestamp) + 3,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      const currentEpochPrice1 = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 28800,
      );
      console.log((await perpetualOracle.initialTimestamps(chainlinkTokenIndex1)).toString());
      console.log((await perpetualOracle.indexPriceEpochsCount(chainlinkTokenIndex1)).toString());
      expect(currentEpochPrice1.toString()).to.be.equal("350000000000");
    });
    it("should fetch last epoch price", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "30000000000000",
        parseInt(currentTimestamp),
        parseInt(currentTimestamp),
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await chainlinkAggregator1.updateRoundData(
        "162863638383903",
        "40000000000000",
        parseInt(currentTimestamp) + 1,
        parseInt(currentTimestamp) + 1,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      // Since there are no mark price observation added epoch price will come out to be 0
      const currentEpochPrice = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 28800,
      );
      expect(currentEpochPrice.toString()).to.be.equal("0");
      await perpetualOracle.addMarkObservation(chainlinkTokenIndex1, 300000000000);
      await chainlinkAggregator1.updateRoundData(
        "162863638383905",
        "30000000000000",
        parseInt(currentTimestamp) + 2,
        parseInt(currentTimestamp) + 2,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      await chainlinkAggregator1.updateRoundData(
        "162863638383906",
        "40000000000000",
        parseInt(currentTimestamp) + 3,
        parseInt(currentTimestamp) + 3,
      );
      await perpetualOracle.cacheChainlinkPrice(chainlinkTokenIndex1);
      const currentEpochPrice1 = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 28800,
      );

      expect(currentEpochPrice1.toString()).to.be.equal("350000000000");
      await time.increase(28800);
      const currentEpochPrice2 = await perpetualOracle.getIndexEpochSMA(
        chainlinkTokenIndex1,
        parseInt(currentTimestamp),
        parseInt(currentTimestamp) + 57600,
      );
      expect(currentEpochPrice2.toString()).to.be.equal("350000000000");
    });
    it("should over ride already added token ", async () => {
      const newTokenIndex =
        "57896044618658097711785492504343953926634992332820282019728792003956564819980";
      const chainlinkBaseToken5 = await upgrades.deployProxy(
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
      await perpetualOracle.addChainlinkBaseToken(
        newTokenIndex,
        chainlinkAggregator1.address,
        chainlinkBaseToken5.address,
        "5100000",
      );
      const baseTokenByIndex1 = await perpetualOracle.baseTokenByIndex(newTokenIndex);
      expect(baseTokenByIndex1).to.be.equal(chainlinkBaseToken5.address);
      const aggregatorByIndex1 = await perpetualOracle.chainlinkAggregatorByIndex(newTokenIndex);
      expect(aggregatorByIndex1).to.be.equal(chainlinkAggregator1.address);
      const sigmaViv1 = await accountBalance1.sigmaVolmexIvs(
        "57896044618658097711785492504343953926634992332820282019728792003956564819980",
      );
      expect(sigmaViv1.toString()).to.be.equal("5100000");
      await perpetualOracle.addChainlinkBaseToken(
        newTokenIndex,
        chainlinkAggregator1.address,
        chainlinkBaseToken5.address,
        "8100000",
      );
      const sigmaViv2 = await accountBalance1.sigmaVolmexIvs(
        "57896044618658097711785492504343953926634992332820282019728792003956564819980",
      );
      expect(sigmaViv2.toString()).to.be.equal("8100000");
    });
    it("should add baseToken", async () => {
      const newTokenIndex =
        "57896044618658097711785492504343953926634992332820282019728792003956564819980";
      const chainlinkBaseToken5 = await upgrades.deployProxy(
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
      await perpetualOracle.addChainlinkBaseToken(
        newTokenIndex,
        chainlinkAggregator1.address,
        chainlinkBaseToken5.address,
        "5100000",
      );
      const baseTokenByIndex1 = await perpetualOracle.baseTokenByIndex(newTokenIndex);
      expect(baseTokenByIndex1).to.be.equal(chainlinkBaseToken5.address);
      const aggregatorByIndex1 = await perpetualOracle.chainlinkAggregatorByIndex(newTokenIndex);
      expect(aggregatorByIndex1).to.be.equal(chainlinkAggregator1.address);
      const sigmaViv = await accountBalance1.sigmaVolmexIvs(
        "57896044618658097711785492504343953926634992332820282019728792003956564819980",
      );
      expect(sigmaViv.toString()).to.be.equal("5100000");
    });
    it("should fail to add base token", async () => {
      await expect(
        perpetualOracle.addChainlinkBaseToken(
          "57896044618658097711785492504343953926634992332820282019728792003956564819967",
          chainlinkAggregator1.address,
          volmexBaseToken.address,
          "4710000",
        ),
      ).to.be.revertedWith("PerpOracle: invalid chainlink base token index");
    });
  });
});
