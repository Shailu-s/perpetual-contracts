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
  let VolmexBaseToken;
  let volmexBaseToken;
  let volmexBaseToken1;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let PerpetualOracle;
  let perpetualOracle;
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
    volmexBaseToken1 = await upgrades.deployProxy(
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
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken1.address],
        [200000000, 200000000],
        [200000000, 200000000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);
    baseToken = await upgrades.deployProxy(
      VolmexBaseToken,
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
    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, perpetualOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

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

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        marketRegistry.address,
        [volmexBaseToken.address, volmexBaseToken1.address],
        [owner.address, account2.address],
        "1000000000000000000",
      ],
      {
        initializer: "initialize",
      },
    );
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();

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

    await (await perpetualOracle.setPositioning(positioning.address)).wait();
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);

    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
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
    await perpetualOracle.setIndexObservationAdder(owner.address);
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
