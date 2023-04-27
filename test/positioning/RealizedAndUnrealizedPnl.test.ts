import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { FundingRate, IndexPriceOracle, MarkPriceOracle } from "../../typechain";
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("Positioning", function () {
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
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;

  let transferManagerTest;
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
  const capRatio = "400000000";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    BaseToken = await ethers.getContractFactory("VolmexBaseToken");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    liquidator = encodeAddress(owner.address);

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [200000000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await indexPriceOracle.deployed();
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[200000000], [volmexBaseToken.address], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    await (await indexPriceOracle.grantInitialTimestampRole(markPriceOracle.address)).wait();

    baseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "BaseToken", // nameArg
        "BTN", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
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

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address]);
    await positioningConfig.deployed();
    await markPriceOracle.grantSmaIntervalRole(positioningConfig.address);
    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await markPriceOracle.setObservationAdder(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);

    // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
        [owner.address, account2.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0004e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap(convert("100000000000000000000000000"));

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await markPriceOracle.setPositioning(positioning.address)).wait();
    await (await markPriceOracle.setIndexOracle(indexPriceOracle.address)).wait();
    await positioningConfig.setTwapInterval(28800);

    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      [vault.address, vault2.address],
      owner.address,
      relayer.address,
    ]);
    deadline;
    await virtualToken.mint(account1.address, convert("100"));
    await virtualToken.mint(account2.address, convert("100"));
    await virtualToken.connect(account1).approve(vault.address, convert("100"));
    await virtualToken.connect(account2).approve(vault.address, convert("100"));
    await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("100"));
    await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("100"));
    await indexPriceOracle.setObservationAdder(owner.address);
    await vaultController
      .connect(account1)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account1.address,
        convert("100"),
      );
    await vaultController
      .connect(account2)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account2.address,
        convert("100"),
      );
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
        Asset(volmexBaseToken.address, convert("1")),
        25,
        0,
        false,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, convert("1")),
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
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("-80000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-80000000000000000");

      await time.increase(10000);
      for (let i = 0; i < 10; i++) {
        await indexPriceOracle.addObservation([250000000], [0], [proofHash]);
      }
      await time.increase(18800);
      for (let i = 0; i < 10; i++) {
        await indexPriceOracle.addObservation([250000000], [0], [proofHash]);
      }
      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("49920000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-50080000000000000000");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert("250")),
        Asset(volmexBaseToken.address, convert("1")),
        98,
        0,
        false,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, convert("1")),
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
          realizedPnl.push(ethers.utils.defaultAbiCoder.decode(["int256"], log["data"])[0]);
        }
      });
      console.log(realizedPnl);
      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      const realisedPnlTrader2 = pnlTrader2[0];
      const realisedPnlTrader1 = pnlTrader1[0];
      expect(realisedPnlTrader2).to.be.equal(realizedPnl[0].add(realizedPnl[3]));
      expect(realisedPnlTrader1).to.be.equal(realizedPnl[1].add(realizedPnl[4]));
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
        Asset(volmexBaseToken.address, convert("1")),
        25,
        0,
        false,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, convert("1")),
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
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("-80000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("-80000000000000000");

      await time.increase(10000);
      for (let i = 0; i < 10; i++) {
        await indexPriceOracle.addObservation([150000000], [0], [proofHash]);
      }
      await time.increase(18800);
      for (let i = 0; i < 10; i++) {
        await indexPriceOracle.addObservation([150000000], [0], [proofHash]);
      }

      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      unrealisedPnlTrader1 = pnlTrader1[1].toString();
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      unrealisedPnlTrader2 = pnlTrader2[1].toString();
      expect(unrealisedPnlTrader1).to.be.equal("-50080000000000000000");
      expect(unrealisedPnlTrader2).to.be.equal("49920000000000000000");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert("150")),
        Asset(volmexBaseToken.address, convert("1")),
        98,
        0,
        false,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, convert("1")),
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
          realizedPnl.push(ethers.utils.defaultAbiCoder.decode(["int256"], log["data"])[0]);
        }
      });
      console.log(realizedPnl);
      pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account1.address);
      pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account2.address);
      const realisedPnlTrader2 = pnlTrader2[0];
      const realisedPnlTrader1 = pnlTrader1[0];
      expect(realisedPnlTrader2).to.be.equal(realizedPnl[0].add(realizedPnl[3]));
      expect(realisedPnlTrader1).to.be.equal(realizedPnl[1].add(realizedPnl[4]));
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
