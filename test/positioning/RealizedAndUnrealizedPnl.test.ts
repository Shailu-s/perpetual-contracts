import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("Realised pnl tests", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxy;
  let TransferManagerTest;
  let ERC1271Test;
  let erc1271Test;
  let Positioning;
  let positioning;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault, vault2;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let accountBalance;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let BaseToken;
  let BaseToken;
  let BaseToken1;
  let BaseToken2;
  let BaseToken3;
  let PerpPeriphery;
  let PerpPeriphery;
  let PerpetualOracle;
  let perpetualOracle;
  let transferManagerTest;
  let FundingRate;
  let fundingRate;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let orderLeft, orderRight;
  const deadline = 87654321987654;
  const maxFundingRate = 0.08;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;

  const one = ethers.constants.WeiPerEther; // 1e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")); // 10e18
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const capRatio = "400000000";

  this.beforeAll(async () => {
    PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");

    // fundingRate = await smock.fake("FundingRate")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    ERC1271Test = await ethers.getContractFactory("ERC1271Test");
    Positioning = await ethers.getContractFactory("PositioningTest");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    BaseToken = await ethers.getContractFactory("BaseToken");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    BaseToken = await ethers.getContractFactory("BaseToken");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    FundingRate = await ethers.getContractFactory("FundingRate");
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    liquidator = encodeAddress(owner.address);

    BaseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
    BaseToken1 = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
    BaseToken2 = await upgrades.deployProxy(
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
    await BaseToken2.deployed();
    BaseToken3 = await upgrades.deployProxy(
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
    await BaseToken3.deployed();
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          BaseToken.address,
          BaseToken1.address,
          BaseToken2.address,
          BaseToken3.address,
        ],
        [200000000, 200000000, 1800000000, 30650000000],
        [200000000, 200000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await BaseToken.setPriceFeed(perpetualOracle.address);
    await BaseToken1.setPriceFeed(perpetualOracle.address);
    baseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "BTN", // symbolArg,
        perpetualOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await baseToken.deployed();

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit",
    });
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await positioningConfig.deployed();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, perpetualOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );
    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        BaseToken.address,
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 18);
    await USDC.deployed();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        BaseToken.address,
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      USDC.address,
      vaultController.address,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      USDC.address,
      vaultController.address,
    ]);
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [
        BaseToken.address,
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
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
    // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

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
          BaseToken1.address,
          BaseToken2.address,
          BaseToken3.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, account2.address],
        ["1000000000000000000", "1000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await (await BaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();

    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0004e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap(convert("100000000000000000000000000"));

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    // await positioning.connect(owner).setPositioning(positioning.address);

    await (await perpetualOracle.setFundingRate(fundingRate.address)).wait();
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);

    perpViewFake = await smock.fake("PerpView");
    PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault2.address],
      owner.address,
      relayer.address,
    ]);
    await vaultController.setPeriphery(PerpPeriphery.address);
    deadline;
    await USDC.mint(account1.address, convert("100"));
    await USDC.mint(account2.address, convert("100"));
    await USDC.connect(account1).approve(vault.address, convert("100"));
    await USDC.connect(account2).approve(vault.address, convert("100"));
    await USDC.connect(account1).approve(PerpPeriphery.address, convert("100"));
    await USDC.connect(account2).approve(PerpPeriphery.address, convert("100"));
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await vaultController
      .connect(account1)
      .deposit(PerpPeriphery.address, USDC.address, account1.address, convert("100"));
    await vaultController
      .connect(account2)
      .deposit(PerpPeriphery.address, USDC.address, account2.address, convert("100"));
    for (let i = 0; i < 10; i++) {
      await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      await perpetualOracle.addIndexObservations([1], [200000000], [proofHash]);
    }
  });
  describe("Testing scenarios for realized and unrealised pnl", async () => {
    /* Scenario 1 : After opening a long position and indextwap moves favorably, the user’s 
		                unrealized pnl should be positive.After closing position, at the indextwap value,
		                the realized pnl should be positive.
    */

    /* Scenario 2 :After opening a short position and indextwap moves unfavorably, the user’s
									 unrealized pnl should be negative. After closing position, at the indextwap value, 
									 the realized pnl should be negative.
		*/

    it("Scenario 1 and 2", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, convert("200")),
        Asset(BaseToken.address, convert("1")),
        25,
        0,
        false,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(BaseToken.address, convert("1")),
        Asset(virtualToken.address, convert("200")),
        28,
        0,
        true,
      );
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      let openPosition = await positioning.openPosition(
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      let pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      let realisedPnlTrader1 = pnlTrader1[0].toString();
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      let realisedPnlTrader2 = pnlTrader2[0].toString();
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(realisedPnlTrader1).to.be.equal("0");
      expect(realisedPnlTrader2).to.be.equal("0");
      expect(unrealisedPnlTrader1).to.be.equal("-80000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-80000000000000000");

      await time.increase(10000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [250000000], [proofHash]);
      }

      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      realisedPnlTrader1 = pnlTrader1[0].toString();
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      realisedPnlTrader2 = pnlTrader2[0].toString();
      unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(realisedPnlTrader1).to.be.equal("0");
      expect(realisedPnlTrader2).to.be.equal("0");
      expect(unrealisedPnlTrader1).to.be.equal("49920000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-50080000000000000000");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert("250")),
        Asset(BaseToken.address, convert("1")),
        98,
        0,
        false,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(BaseToken.address, convert("1")),
        Asset(virtualToken.address, convert("250")),
        90,
        0,
        true,
      );
      const signatureLeft1 = await getSignature(orderLeft1, account2.address);
      const signatureRight1 = await getSignature(orderRight1, account1.address);
      openPosition = await positioning.openPosition(
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const { events } = await openPosition.wait();
      const pnlRealisedEventHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("PnlRealized(address,address,int256)"),
      );
      const realizedPnl = [];
      events.forEach((log: any) => {
        if (log["topics"][0] == pnlRealisedEventHash) {
          realizedPnl.push(
            ethers.utils.defaultAbiCoder.decode(["int256"], log["data"])[0].toString(),
          );
        }
      });
      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      unrealisedPnlTrader2 = pnlTrader1[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("0");
      expect(unrealisedPnlTrader2).to.be.equal("0");
      realisedPnlTrader2 = pnlTrader2[0].toString();
      realisedPnlTrader1 = pnlTrader1[0].toString();
      expect(realisedPnlTrader2).to.be.equal("-50180000000000000000");
      expect(realisedPnlTrader1).to.be.equal("49820000000000000000");
      const freeCollateralTrader1 = await vaultController.getFreeCollateralByRatio(
        account1.address,
        1000000,
      );
      expect(freeCollateralTrader1.toString()).to.be.equal("149820000000000000000");
      const freeCollateralTrader2 = await vaultController.getFreeCollateralByRatio(
        account2.address,
        1000000,
      );
      expect(freeCollateralTrader2.toString()).to.be.equal("49820000000000000000");
    });

    /* Scenario 3 : After opening a long position and indextwap moves unfavorably, the user’s 
											unrealized pnl should be negative. After closing position at the indextwap value, 
											the realized pnl should be negative.

    */

    /* Scenario 4 : After opening a short position and indextwap moves favorably, the user’s 
										unrealized pnl should be positive. After closing position at the indextwap value, 
										the realized pnl should be positive.
		*/

    it("Scenario 3 and 4", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, convert("200")),
        Asset(BaseToken.address, convert("1")),
        25,
        0,
        false,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(BaseToken.address, convert("1")),
        Asset(virtualToken.address, convert("200")),
        28,
        0,
        true,
      );
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      let openPosition = await positioning.openPosition(
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      let pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      let realisedPnlTrader1 = pnlTrader1[0].toString();
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      let realisedPnlTrader2 = pnlTrader2[0].toString();
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(realisedPnlTrader1).to.be.equal("0");
      expect(realisedPnlTrader2).to.be.equal("0");
      expect(unrealisedPnlTrader1).to.be.equal("-80000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-80000000000000000");

      await time.increase(10000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [150000000], [proofHash]);
      }

      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      realisedPnlTrader1 = pnlTrader1[0].toString();
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      realisedPnlTrader2 = pnlTrader2[0].toString();
      unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(realisedPnlTrader1).to.be.equal("0");
      expect(realisedPnlTrader2).to.be.equal("0");
      expect(unrealisedPnlTrader1).to.be.equal("-50080000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("49920000000000000000");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert("150")),
        Asset(BaseToken.address, convert("1")),
        98,
        0,
        false,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(BaseToken.address, convert("1")),
        Asset(virtualToken.address, convert("150")),
        90,
        0,
        true,
      );
      const signatureLeft1 = await getSignature(orderLeft1, account2.address);
      const signatureRight1 = await getSignature(orderRight1, account1.address);
      openPosition = await positioning.openPosition(
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const { events } = await openPosition.wait();
      const pnlRealisedEventHash = ethers.utils.keccak256(
        ethers.utils.toUtf8Bytes("PnlRealized(address,address,int256)"),
      );
      const realizedPnl = [];
      events.forEach((log: any) => {
        if (log["topics"][0] == pnlRealisedEventHash) {
          realizedPnl.push(
            ethers.utils.defaultAbiCoder.decode(["int256"], log["data"])[0].toString(),
          );
        }
      });

      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      unrealisedPnlTrader2 = pnlTrader1[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("0");
      expect(unrealisedPnlTrader2).to.be.equal("0");
      realisedPnlTrader2 = pnlTrader2[0].toString();
      realisedPnlTrader1 = pnlTrader1[0].toString();
      expect(realisedPnlTrader2).to.be.equal("49860000000000000000");
      expect(realisedPnlTrader1).to.be.equal("-50140000000000000000");
      const freeCollateralTrader1 = await vaultController.getFreeCollateralByRatio(
        account1.address,
        1000000,
      );
      expect(freeCollateralTrader1.toString()).to.be.equal("49860000000000000000");
      const freeCollateralTrader2 = await vaultController.getFreeCollateralByRatio(
        account2.address,
        1000000,
      );
      expect(freeCollateralTrader2.toString()).to.be.equal("149860000000000000000");
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
});
