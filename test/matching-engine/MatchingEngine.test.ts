import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
const libDeal = require("../libDeal");
import { BigNumber } from "ethers";

describe("MatchingEngine", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxyTest;
  let TransferManagerTest;
  let community;
  let ERC1271Test;
  let erc1271Test;
  let asset;
  let MarkPriceOracle;
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
  let markPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let IndexPriceOracle;
  let MarketRegistry;
  let marketRegistry;
  let indexPriceOracle;
  let volmexPerpPeriphery;
  let VolmexPerpPeriphery;
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
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    Positioning = await ethers.getContractFactory("PositioningTest");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    ERC1271Test = await ethers.getContractFactory("ERC1271Test");
    TestERC20 = await ethers.getContractFactory("TestERC20");
  });

  beforeEach(async () => {
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
    const liquidator = encodeAddress(owner.address);
    erc20TransferProxy = await ERC20TransferProxyTest.deploy();
    community = account4.address;

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
      [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[1000000], [volmexBaseToken.address], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    await (await indexPriceOracle.grantInitialTimestampRole(markPriceOracle.address)).wait();
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address]);
    await positioningConfig.deployed();
    await markPriceOracle.grantSmaIntervalRole(positioningConfig.address);
    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance.address,
    ]);

    await positioningConfig.deployed();
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
        [owner.address, account2.address],
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
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      account4.address,
    ]);
    await indexPriceOracle.setObservationAdder(owner.address);
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
    await (await markPriceOracle.setPositioning(positioning.address)).wait();
    await (await markPriceOracle.setIndexOracle(indexPriceOracle.address)).wait();
    await positioningConfig.setTwapInterval(28800);

    asset = Asset(virtualToken.address, "10");

    await virtualToken.connect(account1).approve(vault.address, ten.toString());
    await virtualToken.connect(account2).approve(vault.address, ten.toString());
    await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
    await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

    // volmexPerpPeriphery.address, USDC.address, alice.address, amount
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
      await matchingEngine.setMakerMinSalt("100");
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
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)) //10,0.1
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["10000000000000000000", "100000000000000000"],
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
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [1, 2],
            ["20000000000000000000", "2000000000000000000"],
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
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [2, 1],
            ["10000000000000000000", "20000000000000000000"],
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
            ["100000000000000000000", "10000000000000000000"],
          );

        // price = 0.2
        await expect(matchingEngine.matchOrders(orderLeft1, orderRight)) //50,10
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account2.address, account1.address],
            [3, 1],
            ["50000000000000000000", "20000000000000000000"],
          );
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
            ["10000000000000000000", "20000000000000000000"],
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
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
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
        await expect(matchingEngine.matchOrders(orderLeft, orderRight)).to.be.revertedWith(
          "V_PERP_M: fillRight: unable to fill",
        );
      });
      it(" should fail if trader for both the orders in same", async () => {
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
          Asset(volmexBaseToken.address, "100"),
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
          .withArgs([account1.address, account2.address], [1, 2], ["10", "2"]);
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
          Asset(volmexBaseToken.address, "20"),
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
            ["20", "10"],
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

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["700000000000000000000", "9859154929577464788"],
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

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder))
          .to.emit(matchingEngine, "Matched")
          .to.emit(matchingEngine, "OrdersFilled")
          .withArgs(
            [account1.address, account2.address],
            [2, 3],
            ["700000000000000000000", "5384615384615384615"],
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

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder)).to.be.revertedWith(
          "V_PERP_M: fillLeft: unable to fill",
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "5384615384615384615"],
          );
      });
      it("Should not match orders with lower price than 70", async () => {
        // price = 69
        const buyOrder = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "690000000000000000000"), //690
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder)).to.be.revertedWith(
          "V_PERP_M: fillLeft: unable to fill",
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "5384615384615384615"],
          );
      });
      it("Should not match orders with lower price than 70", async () => {
        // price = 69
        const buyOrder = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "690000000000000000000"), //690
          Asset(volmexBaseToken.address, "10000000000000000000"), //10
          2,
          0,
          false,
        );

        await expect(matchingEngine.matchOrders(buyOrder, sellOrder)).to.be.revertedWith(
          "V_PERP_M: fillLeft: unable to fill",
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
            ["700000000000000000000", "9859154929577464788"],
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
            ["700000000000000000000", "9859154929577464788"],
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
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
