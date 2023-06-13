import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Result } from "ethers/lib/utils";
import { smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { expectRevert } = require("@openzeppelin/test-helpers");
const { Order, Asset, sign, encodeAddress } = require("../order");
import { time } from "@nomicfoundation/hardhat-network-helpers";
const libDeal = require("../libDeal");

describe("MatchingEngine", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxyTest;
  let TransferManagerTest;
  let PerpetualOracle;
  let perpetualOracle;
  let asset;
  let PositioningConfig;
  let positioningConfig;
  let Positioning;
  let positioning;
  let AccountBalance;
  let accountBalance;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let VolmexBaseToken;
  let volmexBaseToken;
  let MarketRegistry;
  let marketRegistry;
  let volmexPerpPeriphery;
  let VolmexPerpPeriphery;
  let volmexBaseToken1;
  let perpViewFake;
  let TestERC20;
  let USDC;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";
  let transferManagerTest;
  const deadline = 87654321987654;
  const VirtualTokenAdmin = "0xf24678cc6ef041b5bac447b5fa553504d5f318f8003914a05215b2ac7d7314e2";
  let orderLeft, orderRight;
  let owner, account1, account2, account3, account4;
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000000")); // 10e18

  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    Positioning = await ethers.getContractFactory("PositioningTest");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    TestERC20 = await ethers.getContractFactory("TestERC20");
  });

  beforeEach(async () => {
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
    const liquidator = encodeAddress(owner.address);
    erc20TransferProxy = await ERC20TransferProxyTest.deploy();

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
        [10000000, 10000000],
        [10000000, 10000000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);
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
      [volmexBaseToken.address, volmexBaseToken1.address],
      matchingEngine.address,
      owner.address,
    ]);
    await accountBalance.deployed();
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance.address,
    ]);

    await positioningConfig.deployed();
    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        matchingEngine.address,
        perpetualOracle.address,
        marketRegistry.address,
        [volmexBaseToken.address, volmexBaseToken.address],
        [owner.address, account2.address],
        ["1000000000000000000", "1000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);
    await (await virtualToken.setMintBurnRole(owner.address)).wait();
    await virtualToken.mint(account1.address, ten.toString());
    await virtualToken.mint(account2.address, ten.toString());
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.connect(owner).setMintBurnRole(positioning.address)).wait();
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      account4.address,
    ]);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);

    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("100000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);
    await (await perpetualOracle.setPositioning(positioning.address)).wait();
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance.address);
    await positioningConfig.setTwapInterval(28800);

    asset = Asset(virtualToken.address, "10");

    await virtualToken.connect(account1).approve(vault.address, ten.toString());
    await virtualToken.connect(account2).approve(vault.address, ten.toString());
    await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
    await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

    // volmexPerpPeriphery.address, USDC.address, account1.address, amount
    await vaultController
      .connect(account1)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account1.address,
        ten.toString(),
      );
    await vaultController
      .connect(account2)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account2.address,
        ten.toString(),
      );
    const orderLeft2 = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(virtualToken.address, two.toString()),
      45,
      0,
      true,
    );

    const orderRight2 = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(virtualToken.address, one.toString()),
      Asset(volmexBaseToken.address, one.toString()),
      67,
      0,
      false,
    );
    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(virtualToken.address, two.toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(virtualToken.address, one.toString()),
      Asset(volmexBaseToken.address, one.toString()),
      2,
      0,
      false,
    );
    let signatureLeft = await getSignature(orderLeft2, account1.address);
    let signatureRight = await getSignature(orderRight2, account2.address);
    await expect(
      positioning
        .connect(account1)
        .openPosition(orderLeft2, signatureLeft, orderRight2, signatureRight, liquidator),
    ).to.emit(positioning, "PositionChanged");
  });

  describe("Deployment", function () {
    it("MatchingEngine deployed confirm", async () => {
      let receipt = await matchingEngine.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("MatchingEngineshould fail to initialze again", async () => {
      await expect(
        matchingEngine.initialize(owner.address, perpetualOracle.address),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("should fail to initialize transfer manager again", async () => {
      await expect(
        transferManagerTest.transferManager_init(erc20TransferProxy.address, owner.address),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Cancel orders:", function () {
    it("Should cancel order successfully", async () => {
      const order1 = Order(
        ORDER,
        deadline,
        owner.address,
        orderLeft.makeAsset,
        orderLeft.takeAsset,
        1,
        0,
        true,
      );
      await expect(matchingEngine.cancelOrder(order1)).to.emit(matchingEngine, "Canceled");
    });

    it("Should cancel order successfully", async () => {
      const order1 = Order(
        ORDER,
        deadline.toString(),
        owner.address,
        orderLeft.makeAsset,
        orderLeft.takeAsset,
        "1",
        "0",
        true,
      );
      await matchingEngine.cancelAllOrders("100");
      await expect(matchingEngine.cancelOrder(order1)).to.be.revertedWith(
        "V_PERP_M: order salt lower",
      );
    });

    it("will fail to cancel order if maker is not owner", async () => {
      await expect(matchingEngine.cancelOrder(orderLeft)).to.be.revertedWith(
        "V_PERP_M: not a maker",
      );
    });

    it("will fail to cancel order if salt is 0", async () => {
      const order1 = Order(
        ORDER,
        deadline,
        owner.address,
        orderLeft.makeAsset,
        orderLeft.takeAsset,
        0,
        0,
        true,
      );
      await expect(matchingEngine.cancelOrder(order1)).to.be.revertedWith(
        "V_PERP_M: 0 salt can't be used",
      );
    });
    it("should fail to cancel order", async () => {
      const [owner, account1, accoun2] = await ethers.getSigners();

      const order = Order(
        ORDER,
        10,
        account1.address,
        Asset(virtualToken.address, "20"),
        Asset(virtualToken.address, "20"),
        2,
        0,
        true,
      );

      let ordersList = [];

      for (let index = 0; index < 171; index++) {
        ordersList.push(order);
      }

      await expect(matchingEngine.connect(account2).cancelAllOrders(0)).to.be.revertedWith(
        "V_PERP_M: salt too low",
      );
    });
    // TODO: Need to check for event or something else
    it("should cancel multiple orders", async () => {
      const order1 = Order(
        ORDER,
        deadline,
        owner.address,
        orderLeft.makeAsset,
        orderLeft.takeAsset,
        1,
        0,
        true,
      );
      const order2 = Order(
        ORDER,
        deadline,
        owner.address,
        orderLeft.makeAsset,
        orderLeft.takeAsset,
        2,
        0,
        true,
      );

      var ordersList: any[] = [order1, order2];

      const receipt = await matchingEngine.cancelOrdersInBatch(ordersList);
      expect(receipt.confirmations).not.equal(0);
    });

    it("will fail to cancel all orders when salt is too low", async () => {
      await expect(matchingEngine.cancelAllOrders(0)).to.be.revertedWith("V_PERP_M: salt too low");
    });

    it("should cancel all orders", async () => {
      const [owner] = await ethers.getSigners();
      await expect(matchingEngine.cancelAllOrders(10))
        .to.emit(matchingEngine, "CanceledAll")
        .withArgs(owner.address, 10);
    });
  });

  describe("Match orders:", function () {
    describe("Failure:", function () {
      it("should fail to match orders as left order assets don't match", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "40"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "V_PERP_M: left make assets don't match",
        );
      });
      it("should fail to match orders as left order .takevalue == 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "0"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "V_PERP_M: nothing to fill",
        );
      });
      it("Should match orders when when orderRight is profitable", async () => {
        // price = 100
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "100000000000000000000"), //100
          Asset(volmexBaseToken.address, "1000000000000000000"), //1
          1,
          0,
          false,
        );

        // price = 0.5
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          Asset(virtualToken.address, "10000000000000000000"), //10
          2,
          0,
          true,
        );

        // price = 100

        await expect(matchingEngine.matchOrders(orderRight, orderLeft)) //10,0.1
          .to.emit(matchingEngine, "Matched")
          .withArgs(
            [account2.address, account1.address],
            [deadline, deadline],
            ["1000000000000000000", "1000000000000000000"],
          )
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [2, 1],
            ["1000000000000000000", "1000000000000000000"],
          );
      });
      it("Should partial match orderLeft and full match order right", async () => {
        // price = 0.1
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          Asset(virtualToken.address, "10000000000000000000"), //10
          1,
          0,
          true,
        );

        // price = 0.5
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"), //10
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          2,
          0,
          false,
        );
        // price = 0.1
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
          .to.emit(matchingEngine, "Matched")
          .withArgs(
            [account1.address, account2.address],
            [deadline, deadline],
            ["10000000000000000000", "20000000000000000000"],
          )
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["20000000000000000000", "20000000000000000000"],
          );
      });
      it("Should match orders when when orderLeft is profitable", async () => {
        // price = 2
        const orderLeft = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          Asset(virtualToken.address, "20000000000000000000"), //20
          2,
          0,
          true,
        );

        // price = 10
        const orderRight = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "1000000000000000000000"), //1000
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          1,
          0,
          false,
        );
        // price = 2
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //10,20
          .to.emit(matchingEngine, "Matched")
          .withArgs(
            [account1.address, account2.address],
            [deadline, deadline],
            ["100000000000000000000", "10000000000000000000"],
          )
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [2, 1],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
      it("Should match orders continuesly orderright unitl not filled", async () => {
        // price = 0.1
        const orderLeft = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "1000000000000000000000"), //1000
          Asset(virtualToken.address, "100000000000000000000"), //100
          2,
          0,
          true,
        );
        // price = 0.2
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          Asset(virtualToken.address, "20000000000000000000"), //20
          3,
          0,
          true,
        );

        // price = 0.2
        const orderRight = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "20000000000000000000"), //20
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          1,
          0,
          false,
        );
        // price = 0.1
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //100,10
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [2, 1],
            ["100000000000000000000", "100000000000000000000"],
          );

        console.log("Failed at 2nd iteration as orderRight.takeAsset is completely filled");
        await expect(matchingEngine.matchOrders(orderLeft1, orderRight)) //50,10
          .to.revertedWith("V_PERP_M: nothing to fill");
      });
      it("Should match orders with equal price", async () => {
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "10000000000000000000"), //10
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          Asset(virtualToken.address, "10000000000000000000"), //10
          2,
          0,
          true,
        );
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) // 10,20
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["20000000000000000000", "20000000000000000000"],
          );
      });
      it("Should fail to match orders when basetoken is 0", async () => {
        //This testcase was created to demonstrate that basetoken Should never be given as 0.
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "0"), //0
          Asset(virtualToken.address, "100000000000000000000"), //1
          1,
          0,
          true,
        );

        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20000000000000000000"), //20
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "division by zero",
        );
      });
      it("Should fail to match orders when basetoken is 1", async () => {
        //This testcase was created to demonstrate that basetoken Should never be given as 1.
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "100000000000000000000"), //100
          Asset(volmexBaseToken.address, "1"), //1
          1,
          0,
          false,
        );

        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          Asset(virtualToken.address, "10000000000000000000"), //10
          2,
          0,
          true,
        );
        await expect(matchingEngine.matchOrders(orderRight, orderLeft)).to.be.revertedWith(
          "rounding error",
        );
      });
      it("Should fail to match orders if buy order price is less than required for sell order ", async () => {
        // Price of sell order is 100 and price of buy order is lesser than 100. i.e 5000 /51.Hence it Should not match.
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "5000000000000000000000"), //5000
          Asset(volmexBaseToken.address, "51000000000000000000"), //51
          1,
          0,
          false,
        );

        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "50000000000000000000"), //50
          Asset(virtualToken.address, "5000000000000000000000"), //5000
          2,
          0,
          true,
        );
        await expect(matchingEngine.matchOrders(orderRight, orderLeft)).to.be.revertedWith(
          "V_PERP_M: fillLeft: unable to fill",
        );
      });
      it("should fail if trader for both the orders in same", async () => {
        const [owner, account1] = await ethers.getSigners();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "30"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account1.address);
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "V_PERP_M: order verification failed",
        );
      });
      it("Should Not match orders since executer in not authorised", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "30"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, orderRight),
        ).to.be.revertedWith("MEC_NCMO");
        console.log(" Access not provided");
      });

      it("should fail to match orders as left order take assets don't match", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "V_PERP_M: left take assets don't match",
        );
      });
    });

    describe("Success:", function () {
      it.only("Stop loss order match scenario", async () => {
        const orderLeft = Order(
          "0xe144c7ec",
          deadline,
          "0xA5Bc1D31e32330ED646C22DD84D436eE8315aF7a",
          Asset("0x5b77C6E3116841DE8C753cA801c35b27FFBBC465", "45900000353076925792"),
          Asset("0xe42E9db7a0E4AB0e74C4d8494d18ceF3032ad7A7", "1989000000000000000000"),
          1686591456765000,
          52000000,
          true,
        );

        const orderRight = Order(
          "0xf555eb98",
          1686640796514,
          "0x7c610B4dDA11820b749AeA40Df8cBfdA1925e581",
          Asset("0xe42E9db7a0E4AB0e74C4d8494d18ceF3032ad7A7", "2000000000000000000000"),
          Asset("0x5b77C6E3116841DE8C753cA801c35b27FFBBC465", "40000000000000000000"),
          1686590796439000,
          0,
          false,
        );


        await expect(matchingEngine.matchOrders(orderRight, orderLeft))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
      });
      
      it("should match orders & emit event", async () => {
        await expect(matchingEngine.matchOrders(orderLeft, orderRight))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["1000000000000000000", "1000000000000000000"],
          );
      });

      it("should match orders & emit event when orderRight salt is 0", async () => {
        orderRight.salt = 0;

        await expect(matchingEngine.matchOrders(orderLeft, orderRight))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs([account1.address, account2.address], [1, 0], ["1000000000000000000", "0"]);
      });
      it("should match orders & emit event when orderleft salt is 0", async () => {
        orderLeft.salt = 0;

        await expect(matchingEngine.matchOrders(orderLeft, orderRight))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs([account1.address, account2.address], [0, 2], ["0", "1000000000000000000"]);
      });
      it("Should match orders when when orderRight is short", async () => {
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "10"),
          2,
          0,
          true,
        );
        await expect(matchingEngine.matchOrders(orderLeft, orderRight))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs([account1.address, account2.address], [1, 2], ["20", "20"]);
      });
      it("Should match orders when left order address is 0", async () => {
        const orderLeft = Order(
          ORDER,
          deadline,
          "0x0000000000000000000000000000000000000000",
          Asset(volmexBaseToken.address, "40"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "40"),
          2,
          0,
          true,
        );
        await expect(matchingEngine.matchOrders(orderLeft, orderRight))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            ["0x0000000000000000000000000000000000000000", account2.address],
            [1, 2],
            ["20", "20"],
          );
      });
    });
  });
  describe("Test on the basis of prices:", function () {
    let sellOrder;
    let stopLossOrder;
    let takeProfitOrder;
    beforeEach(async () => {
      // Here, we'll develop test scenarios for matching orders purchases based on cost. Let's suppose that the Oracle returned a mark price of 100.
      // The greatest deviation will be assumed to be plus or minus 30%. Therefore, the lowest price may be 70 and the highest price may be 100.      // Lets create a sell order with the price 70. It

      //  Create a market sell order with price 70. It Should match with every order price higher than it.
      sellOrder = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "700000000000000000000"), //700
        3,
        0,
        true,
      );

      stopLossOrder = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "700000000000000000000"), //700
        3,
        0,
        true,
      );

      takeProfitOrder = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "700000000000000000000"), //700
        3,
        0,
        true,
      );
    });
    describe("Market orders match", function () {
      it("Should match orders with price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(sellOrder, buyOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [3, 2],
            ["10000000000000000000", "10000000000000000000"],
          );
      });

      it("Should match orders with highest price", async () => {
        // price = 130
        const buyOrder = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "1300000000000000000000"), //1300
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(sellOrder, buyOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [3, 2],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
      it("Should not match orders with lower price than 70", async () => {
        // price = 69
        const buyOrder = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "690000000000000000000"), //690
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(sellOrder, buyOrder)).to.be.revertedWith(
          "V_PERP_M: fillRight: unable to fill",
        );
      });
      it("Should match stop loss with market order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, stopLossOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
      it("Should match take profit with market order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, takeProfitOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
    });

    describe("Stop loss limit orders match", function () {
      it("Should match with market orders with price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });

      it("Should match orders with highest price", async () => {
        // price = 130
        const buyOrder = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "1300000000000000000000"), //1300
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });

      it("Should match stop loss with stop loss order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          STOP_LOSS_LIMIT_ORDER,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, stopLossOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
      it("Should match stop loss with take profit order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          STOP_LOSS_LIMIT_ORDER,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, takeProfitOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
    });

    describe("Take profit limit orders match", function () {
      it("Should match orders with price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });

      it("Should match orders with highest price", async () => {
        // price = 130
        const buyOrder = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "1300000000000000000000"), //1300
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });

      it("Should match take profit with stop loss order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          TAKE_PROFIT_LIMIT_ORDER,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, stopLossOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
      it("Should match take profit with take profit order of price more than 70", async () => {
        // price = 71
        const buyOrder = Order(
          ORDER,
          TAKE_PROFIT_LIMIT_ORDER,
          account1.address,
          Asset(virtualToken.address, "710000000000000000000"), //710
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, takeProfitOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["10000000000000000000", "10000000000000000000"],
          );
      });
    });
  });
  describe("TransferManager:", function () {
    it("should set transfer proxy & emit event with proxy address", async () => {
      await expect(transferManagerTest.setTransferProxy(erc20TransferProxy.address))
        .to.emit(transferManagerTest, "ProxyChanged")
        .withArgs(erc20TransferProxy.address);
    });
    it("should fail set transfer proxy & emit event with proxy address", async () => {
      await expect(
        transferManagerTest.connect(account3).setTransferProxy(erc20TransferProxy.address),
      ).to.be.revertedWith("TransferExecutor: Not admin");
    });

    it("should call do transfer with fee > 0", async () => {
      const [owner, account1, account2, account3, account4] = await ethers.getSigners();

      await virtualToken.mint(account1.address, 1000000000000000);

      await virtualToken.connect(account1).approve(transferManagerTest.address, 1000000000000000);
      await virtualToken.connect(account2).approve(transferManagerTest.address, 1000000000000000);

      const left = libDeal.DealSide(asset, erc20TransferProxy.address, account1.address);

      const right = libDeal.DealSide(asset, erc20TransferProxy.address, account2.address);

      await transferManagerTest.checkDoTransfers(left, right);
    });

    it("should call do transfer where DealData.maxFeeBasePoint is 0", async () => {
      const [owner, account1, account2, account3, account4] = await ethers.getSigners();

      await virtualToken.mint(account1.address, 1000000000000000);

      await virtualToken.connect(account1).approve(transferManagerTest.address, 1000000000000000);
      await virtualToken.connect(account2).approve(transferManagerTest.address, 1000000000000000);

      const left = libDeal.DealSide(asset, erc20TransferProxy.address, account1.address);

      const right = libDeal.DealSide(asset, erc20TransferProxy.address, account2.address);

      await transferManagerTest.checkDoTransfers(left, right);
    });
  });

  describe("Bulk Methods:", function () {
    it("should match orders & emit event", async () => {
      let ordersLeft = [];
      let ordersRight = [];
      let salt = 3;
      for (let index = 0; index < 46; index++) {
        ordersLeft.push(
          Order(
            ORDER,
            deadline,
            account1.address,
            Asset(virtualToken.address, two.toString()),
            Asset(volmexBaseToken.address, one.toString()),
            salt,
            0,
            true,
          ),
        );
        salt++;

        ordersRight.push(
          Order(
            ORDER,
            deadline,
            account2.address,
            Asset(volmexBaseToken.address, one.toString()),
            Asset(virtualToken.address, one.toString()),
            salt,
            0,
            true,
          ),
        );
        salt++;
      }
      const receipt = await (
        await matchingEngine.matchOrderInBatch(ordersLeft, ordersRight)
      ).wait();
      // await expect(matchingEngine.connect(owner).matchOrderInBatch(ordersLeft, signaturesLeft, ordersRight, signaturesRight)).to.emit(
      //   matchingEngine,
      //   "Matched",
      // )
    });

    it("should cancel multiple orders", async () => {
      const [owner, account1] = await ethers.getSigners();

      const order = Order(
        ORDER,
        10,
        account1.address,
        Asset(virtualToken.address, "20"),
        Asset(virtualToken.address, "20"),
        1,
        0,
        true,
      );

      let ordersList = [];

      for (let index = 0; index < 100; index++) {
        ordersList.push(order);
      }

      const receipt = await (
        await matchingEngine.connect(account1).cancelOrdersInBatch(ordersList)
      ).wait();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe("Grant Access methods:", function () {
    it("should fail to grant access", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        matchingEngine.connect(account1).grantMatchOrders(account1.address),
      ).to.be.revertedWith("MatchingEngineCore: Not admin");
    });
  });
  describe("transfer payout else condition", async () => {
    it("should pass with 0 amount", async () => {
      await transferManagerTest.transferPayouts(
        account1.address,
        0,
        owner.address,
        account2.address,
        vault.address,
      );
    });
  });

  describe("pausable contract", function () {
    it("should fail to match orders when contract is paused", async () => {
      await matchingEngine.pause();
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
        "Pausable: paused",
      );
    });
    it("should fail to match order in batch when contract is paused", async () => {
      await matchingEngine.pause();
      let ordersLeft = [];
      let ordersRight = [];
      let salt = 3;
      for (let index = 0; index < 46; index++) {
        ordersLeft.push(
          Order(
            ORDER,
            deadline,
            account1.address,
            Asset(virtualToken.address, two.toString()),
            Asset(volmexBaseToken.address, one.toString()),
            salt,
            0,
            true,
          ),
        );
        salt++;

        ordersRight.push(
          Order(
            ORDER,
            deadline,
            account2.address,
            Asset(volmexBaseToken.address, one.toString()),
            Asset(virtualToken.address, one.toString()),
            salt,
            0,
            true,
          ),
        );
        salt++;
      }
      await expect(matchingEngine.matchOrderInBatch(ordersLeft, ordersRight)).to.be.revertedWith(
        "Pausable: paused",
      );
    });
  });

  describe("Left order - EVIV perp", () => {
    const isShort = true;
    let salt = 0;
    this.beforeEach(async () => {
      await (await matchingEngine.grantMatchOrders(owner.address)).wait();
    });
    describe("Left order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(virtualToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(220)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
    });

    describe("Both order price same", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(virtualToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(10));
        expect(newFills.rightValue).equal(convert(100));
      });
    });

    describe("Right order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(virtualToken.address, convert(220)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        await expectRevert(
          matchingEngine.matchOrders(orderLeft, orderRight),
          "V_PERP_M: fillRight: unable to fill",
        );
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        await expectRevert(
          matchingEngine.matchOrders(orderLeft, orderRight),
          "V_PERP_M: fillRight: unable to fill",
        );
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        await expectRevert(
          matchingEngine.matchOrders(orderLeft, orderRight),
          "V_PERP_M: fillLeft: unable to fill",
        );
      });
    });
  });

  describe("Right order - EVIV perp", () => {
    const isShort = true;
    let salt = 0;
    this.beforeEach(async () => {
      await (await matchingEngine.grantMatchOrders(owner.address)).wait();
    });
    describe("Right order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(220)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(110));
        expect(newFills.rightValue).equal(convert(10));
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(110));
        expect(newFills.rightValue).equal(convert(10));
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(virtualToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(110));
        expect(newFills.rightValue).equal(convert(10));
      });
    });

    describe("Left order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(100));
        expect(newFills.rightValue).equal(convert(10));
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(virtualToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(100));
        expect(newFills.rightValue).equal(convert(10));
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(virtualToken.address, convert(220)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        expect(newFills.leftValue).equal(convert(100));
        expect(newFills.rightValue).equal(convert(10));
      });

      it("playground", async () => {
        // price = 0.1
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          Asset(virtualToken.address, "10000000000000000000"), //10
          1,
          0,
          true,
        );

        // price = 0.5
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"), //10
          Asset(volmexBaseToken.address, "20000000000000000000"), //20
          2,
          0,
          false,
        );
        // price = 0.666
        const orderRight1 = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"), //10
          Asset(volmexBaseToken.address, "15000000000000000000"), //15
          2,
          0,
          false,
        );

        // price = 0.66
        const orderRight2 = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "66000000000000000000"), //66
          Asset(volmexBaseToken.address, "100000000000000000000"), //100
          2,
          0,
          false,
        );

        // price < 0.03
        const orderRightRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "35000000000000000000"), //35
          Asset(virtualToken.address, "1000000000000000000"), //1
          3,
          0,
          true,
        );
        // price = 0.1
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["20000000000000000000", "20000000000000000000"],
          );

        await expect(matchingEngine.matchOrders(orderLeft, orderRight1))
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["35000000000000000000", "15000000000000000000"],
          );

        await expect(matchingEngine.matchOrders(orderLeft, orderRight2))
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["100000000000000000000", "65000000000000000000"],
          );

        await expect(matchingEngine.matchOrders(orderRight2, orderRightRight))
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [2, 3],
            ["100000000000000000000", "35000000000000000000"],
          );
      });
    });
  });

  describe("Max order size - fills", () => {
    it("Should update max order size", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      // price = 0.5
      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["10000000000000000000", "10000000000000000000"],
        );
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("10000000000000000000");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "35000000000000000000"), //10
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      // price = 0.5
      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "35000000000000000000"), //10
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["35000000000000000000", "35000000000000000000"],
        );
      const maxOrderSizeAfter = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeAfter.toString()).to.be.equal("35000000000000000000");
    });
    it("Should get max order size of last one hour", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      // price = 0.5
      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["10000000000000000000", "10000000000000000000"],
        );

      // increase time by  3400 seconds < one hou
      await time.increase(3400);
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("10000000000000000000");
      await time.increase(100);
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      // price = 0.5
      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["3000000000000000000", "3000000000000000000"],
        );
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "60000000000000000000"), //6
        Asset(virtualToken.address, "100000000000000000000"), //100
        6,
        0,
        true,
      );

      // price = 0.5
      const orderRight2 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "60000000000000000000"), //6
        7,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft2, orderRight2))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [6, 7],
          ["60000000000000000000", "60000000000000000000"],
        );

      const maxOrderSizeAfter = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeAfter.toString()).to.be.equal("60000000000000000000");
    });
    it("Should set order size interval and further max order size should be fetched under new interval", async () => {
      // set order size interval to 2 hours
      await matchingEngine.updateOrderSizeInterval(7200);
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      // price = 0.5
      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["10000000000000000000", "10000000000000000000"],
        );
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("10000000000000000000");
      // increase time by one hour
      await time.increase(3600);
      const maxOrderSizeAfterOneHour = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      // max order size should not change before 2 hours to zero
      expect(maxOrderSizeAfterOneHour.toString()).to.be.equal(maxOrderSizeBefore.toString());
      // increase time by one hour
      await time.increase(3600);
      const maxOrderSizeAfterTwoHour = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      // max order size should not change before 2 hours to zero
      expect(maxOrderSizeAfterTwoHour.toString()).to.be.equal("0");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["3000000000000000000", "3000000000000000000"],
        );
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "6000000000000000000"), //6
        Asset(virtualToken.address, "100000000000000000000"), //100
        6,
        0,
        true,
      );

      // price = 0.5
      const orderRight2 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "6000000000000000000"), //6
        7,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft2, orderRight2))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [6, 7],
          ["6000000000000000000", "6000000000000000000"],
        );

      const maxOrderSizeUpdatedAfterTwohours = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeUpdatedAfterTwohours.toString()).to.be.equal("6000000000000000000");
    });
    it("Should set multiple order size and update max order size when previous value is smaller", async () => {
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      // price = 0.5
      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["3000000000000000000", "3000000000000000000"],
        );
      const previousValue = await matchingEngine.getMaxOrderSizeOverTime(volmexBaseToken.address);
      expect(previousValue.toString()).to.be.equal("3000000000000000000");
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "6000000000000000000"), //6
        Asset(virtualToken.address, "100000000000000000000"), //100
        6,
        0,
        true,
      );

      // price = 0.5
      const orderRight2 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "6000000000000000000"), //6
        7,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft2, orderRight2))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [6, 7],
          ["6000000000000000000", "6000000000000000000"],
        );

      const maxOrderSizeUpdatedAfterNewOrder = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeUpdatedAfterNewOrder.toString()).to.be.equal("6000000000000000000");
      // previous value is smaller
      expect(parseInt(previousValue)).to.be.lessThan(parseInt(maxOrderSizeUpdatedAfterNewOrder));
    });
    it("Should set current fill size when new hour has just began", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      // price = 0.5
      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "10000000000000000000"), //10
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["10000000000000000000", "10000000000000000000"],
        );
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("10000000000000000000");
      // increase time by  3400 seconds < one hou
      await time.increase(3600);
      // new hour has just begun
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      // price = 0.5
      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "3000000000000000000"), //3
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["3000000000000000000", "3000000000000000000"],
        );
      // new fill on the begining of new hour 3000000000000000000
      const updatedMaxOrderSize = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(updatedMaxOrderSize.toString()).to.be.equal("3000000000000000000");
    });
    it("Should set the max order size only for that hour", async () => {
      //  first order size set
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "12000000000000000000"), //12
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "12000000000000000000"), //12
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //20,2  10000000000000000000
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["12000000000000000000", "12000000000000000000"],
        );
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("12000000000000000000");

      // increasing time by 30 minutes
      await time.increase(1800);
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "20000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      // price = 0.5
      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "20000000000000000000"), //3
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["20000000000000000000", "20000000000000000000"],
        );
      let maxOrderSizeUpdated = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeUpdated.toString()).to.be.equal("20000000000000000000");
      // since  new fill is greater than previous one

      // after 20 minutes
      await time.increase(1200);
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "30000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        6,
        0,
        true,
      );

      const orderRight2 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "30000000000000000000"), //3
        7,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft2, orderRight2))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [6, 7],
          ["30000000000000000000", "30000000000000000000"],
        );
      maxOrderSizeUpdated = await matchingEngine.getMaxOrderSizeOverTime(volmexBaseToken.address);
      expect(maxOrderSizeUpdated.toString()).to.be.equal("30000000000000000000");
      await time.increase(600);
      console.log((await time.latest()).toString(), "new hour start");
      // at 12:00 PM, set the new size to the struct
      const orderLeft3 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "4000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        6,
        0,
        true,
      );

      const orderRight3 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "4000000000000000000"), //3
        7,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft3, orderRight3))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [6, 7],
          ["4000000000000000000", "4000000000000000000"],
        );
      await time.increase(600);
      console.log((await time.latest()).toString(), "10 minutes after new hour");
      // at 12:10 PM, getter is called, the order size it returns should be in 12:00PM to 12:10PM
      maxOrderSizeUpdated = await matchingEngine.getMaxOrderSizeOverTime(volmexBaseToken.address);
      expect(maxOrderSizeUpdated.toString()).to.be.equal("4000000000000000000");
    });
    it("Should fetch the max order size of that hour only", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "12000000000000000000"), //12
        Asset(virtualToken.address, "100000000000000000000"), //100
        1,
        0,
        true,
      );

      const orderRight = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "12000000000000000000"), //12
        2,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft, orderRight))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [1, 2],
          ["12000000000000000000", "12000000000000000000"],
        );
      const maxOrderSizeBefore = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeBefore.toString()).to.be.equal("12000000000000000000");

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "20000000000000000000"), //20
        Asset(virtualToken.address, "100000000000000000000"), //100
        3,
        0,
        true,
      );

      const orderRight1 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "20000000000000000000"), //20
        4,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft1, orderRight1))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [3, 4],
          ["20000000000000000000", "20000000000000000000"],
        );
      const maxOrderSizeUpdatedPreviousHour = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );
      expect(maxOrderSizeUpdatedPreviousHour.toString()).to.be.equal("20000000000000000000");
      await time.increase(3600);
      // in new hours
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "30000000000000000000"), //3
        Asset(virtualToken.address, "100000000000000000000"), //100
        9,
        0,
        true,
      );

      const orderRight2 = Order(
        STOP_LOSS_LIMIT_ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"), //100
        Asset(volmexBaseToken.address, "30000000000000000000"), //3
        10,
        0,
        false,
      );
      await expect(matchingEngine.matchOrders(orderLeft2, orderRight2))
        .to.emit(matchingEngine, "OrdersFilled")
        .withArgs(
          [account1.address, account2.address],
          [9, 10],
          ["30000000000000000000", "30000000000000000000"],
        );
      const maxOrderSizeUpdatedCurrentHour = await matchingEngine.getMaxOrderSizeOverTime(
        volmexBaseToken.address,
      );

      expect(maxOrderSizeUpdatedCurrentHour.toString()).to.be.equal("30000000000000000000");

      // Check using `orderSizeInitialTimestamp` var to understand hours calculation.
      // if orderSizeInitialTimestamp = 11:34AM, then hour is started from this value only for all max order size calculation
      // Next hour will start at 12:34PM, and similar further.
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});

const oneE18 = "1000000000000000000";
const matchedFills = (receipt: Result) => {
  const matched = receipt.events?.filter(x => {
    return x.event == "Matched";
  });
  return {
    leftValue: matched[0].args[3].toString(),
    rightValue: matched[0].args[4].toString(),
  };
};
const convert = (num: number) => {
  const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
  return BigNumber.from(num).mul(one).toString();
};
