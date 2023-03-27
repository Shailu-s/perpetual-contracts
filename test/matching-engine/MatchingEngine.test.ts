import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign } = require("../order");
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
  let markPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let IndexPriceOracle;
  let indexPriceOracle;
  let TestERC20;
  let USDC;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  let transferManagerTest;
  const deadline = 87654321987654;

  let orderLeft, orderRight;
  let owner, account1, account2, account3, account4;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, matchingEngine.address);
  }
  this.beforeAll(async () => {
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    ERC1271Test = await ethers.getContractFactory("ERC1271Test");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
  });

  beforeEach(async () => {
    erc20TransferProxy = await ERC20TransferProxyTest.deploy();
    community = account4.address;

    volmexBaseToken = await VolmexBaseToken.deploy();
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
      [[1000000], [volmexBaseToken.address], [proofHash], [capRatio], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

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

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", true], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    asset = Asset(virtualToken.address, "10");

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(virtualToken.address, two.toString()),
      Asset(volmexBaseToken.address, two.toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, one.toString()),
      Asset(virtualToken.address, one.toString()),
      2,
      0,
      false,
    );
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
      console.log("here");
      expect(await matchingEngine.cancelOrder(order1)).to.be.revertedWith(
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
        console.log("Here at failing order due to same traders");
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

      for (let index = 0; index < 171; index++) {
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
});
