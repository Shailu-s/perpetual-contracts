import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require('../order');
const libDeal = require("../libDeal")

describe("MatchingEngine", function () {
  let MatchingEngine
  let matchingEngine
  let VirtualToken
  let virtualToken
  let erc20TransferProxy
  let ERC20TransferProxyTest
  let TransferManagerTest
  let community
  let ERC1271Test
  let erc1271Test
  let asset

  let transferManagerTest

  this.beforeAll(async () => {
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    VirtualToken = await ethers.getContractFactory("VirtualToken")
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest")
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest")
    ERC1271Test = await ethers.getContractFactory("ERC1271Test")
  })

  beforeEach(async () => {
    const [owner, account1, account2, account3, account4] = await ethers.getSigners()

    erc20TransferProxy = await ERC20TransferProxyTest.deploy()
    community = account4.address

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [erc20TransferProxy.address, 300, community, owner.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    )
    virtualToken = await upgrades.deployProxy(VirtualToken, ["Virtual Ethereum", "VETH", true], {
      initializer: "__VirtualToken_init",
    })
    asset = Asset(virtualToken.address, "10")

    transferManagerTest = await upgrades.deployProxy(TransferManagerTest, [1, community], {
      initializer: "__TransferManager_init",
    })
  })

  describe("Deployment", function () {
    it("MatchingEngine deployed confirm", async () => {
      let receipt = await matchingEngine.deployed()
      expect(receipt.confirmations).not.equal(0)
    })
  })

  describe("Cancel orders:", function () {
    it("Should cancel order successfully", async () => {
      const [owner, account1] = await ethers.getSigners()

      const order1 = Order(owner.address, 10, true, asset, asset, 1)

      await expect(matchingEngine.cancelOrder(order1)).to.emit(matchingEngine, "Canceled")
    })

    it("Should cancel order successfully", async () => {
      const [owner, account1] = await ethers.getSigners()

      const order1 = Order(owner.address, 10, true, asset, asset, 1)

      await matchingEngine.setMakerMinSalt(100)

      await expect(matchingEngine.cancelOrder(order1)).to.be.revertedWith("V_PERP_M: order salt lower")
    })

    it("will fail to cancel order if maker is not owner", async () => {
      const [owner, account1] = await ethers.getSigners()

      const order1 = Order(account1.address, 10, true, asset, asset, 1)

      await expect(matchingEngine.cancelOrder(order1)).to.be.revertedWith("V_PERP_M: not a maker")
    })

    it("will fail to cancel order if salt is 0", async () => {
      const [owner, account1] = await ethers.getSigners()

      const order1 = Order(owner.address, 10, true, asset, asset, 0)
      await expect(matchingEngine.cancelOrder(order1)).to.be.revertedWith("V_PERP_M: 0 salt can't be used")
    })

    // Need to check for event or something else
    it("should cancel multiple orders", async () => {
      const [owner, account1] = await ethers.getSigners()
      const order1 = Order(account1.address, 10, true, asset, asset, 1)

      const order2 = Order(
        account1.address,
        10,
        true,
        Asset(virtualToken.address, "20"),
        Asset(virtualToken.address, "20"),
        1,
      )

      var ordersList: any[] = [order1, order2]

      const receipt = matchingEngine.cancelOrdersInBatch(ordersList)
      expect(receipt.confirmations).not.equal(0)
    })

    it("will fail to cancel all orders when salt is too low", async () => {
      await expect(matchingEngine.cancelAllOrders(0)).to.be.revertedWith("V_PERP_M: salt too low")
    })

    it("should cancel all orders", async () => {
      const [owner] = await ethers.getSigners()
      await expect(matchingEngine.cancelAllOrders(10))
        .to.emit(matchingEngine, "CanceledAll")
        .withArgs(owner.address, 10)
    })
  })

  describe("Match orders:", function () {
    describe("Failure:", function () {
      it("should fail to match orders as deadline has expired", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          10,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          10,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: Order deadline validation failed")
      })

      it("should fail to match orders as maker is not transaction sender", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: maker is not tx sender")
      })

      it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        let signatureLeft = await getSignature(orderLeft, owner.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: order signature verification error")
      })

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        const orderRight = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account3.address)

        await expect(
          matchingEngine.connect(account1).matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: order verification failed")
      })

      it("should fail to match orders as order maker is contract but signature cannot be verified", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        erc1271Test = await ERC1271Test.deploy()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          erc1271Test.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: contract order signature verification error")
      })

      xit("should fail to match orders as left order assets don't match", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "40"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset("0x0000000000000000000000000000000000000000", "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: make assets don't match")
      })

      xit("should fail to match orders as right order assets don't match", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: assets don't match")
      })

      it("should fail to match orders & revert when default fee receiver is address(0)", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await expect(
          upgrades.deployProxy(
            MatchingEngine,
            [erc20TransferProxy.address, 300, "0x0000000000000000000000000000000000000000", owner.address],
            {
              initializer: "__MatchingEngineTest_init",
            },
          ),
        ).to.be.revertedWith("V_PERP_M: zero address")
      })

      it("should fail to match orders & revert as order is cancelled", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await matchingEngine.connect(account1).setMakerMinSalt(100)
        await expect(
          matchingEngine.matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: Order canceled")
      })
    })

    describe("Success:", function () {
      it("should match orders & emit event", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)
        await expect(matchingEngine.connect(owner).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          matchingEngine,
          "Matched",
        )
      })

      it("should match orders & emit event when maker address is 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          "0x0000000000000000000000000000000000000000",
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(matchingEngine, "Matched")
      })

      it("should match orders & emit event when taker address is 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(matchingEngine, "Matched")
      })

      it("should match orders & emit event when Virtual token balance of order maker is less than the amount to be transferred", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 10)
        await virtualToken.mint(account2.address, 10)

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 20)
        await virtualToken.connect(account2).approve(matchingEngine.address, 20)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(matchingEngine, "Matched")
      })

      it("should match orders & emit event when Virtual token balance of order maker is 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 20)
        await virtualToken.connect(account2).approve(matchingEngine.address, 20)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account1).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(matchingEngine, "Matched")
      })

      it("should match orders & emit event when orderRight salt is 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          matchingEngine.connect(account2).matchOrders(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(matchingEngine, "Matched")
      })

      it("should match orders & order maker is contract", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        erc1271Test = await ERC1271Test.deploy()
        await erc1271Test.setReturnSuccessfulValidSignature(true)

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(erc1271Test.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await erc1271Test.getAllowance(matchingEngine.address, virtualToken.address)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          erc1271Test.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(matchingEngine.matchOrders(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          matchingEngine,
          "Matched",
        )
      })
    })
  })

  describe.only("TransferManager:", function () {
    it("should set transfer proxy & emit event with proxy address", async () => {
      await expect(transferManagerTest.setTransferProxy(erc20TransferProxy.address))
        .to.emit(transferManagerTest, "ProxyChanged")
        .withArgs(erc20TransferProxy.address)
    })

    it("should set protocol fee & emit event with old & new protocol fee", async () => {
      await expect(transferManagerTest.setProtocolFee(100))
        .to.emit(transferManagerTest, "ProtocolFeeChanged")
        .withArgs(1, 100)
    })

    it("should set and get fee receiver", async () => {
      const [owner, account1] = await ethers.getSigners()
      await transferManagerTest.setDefaultFeeReceiver(account1.address)

      const receiver = await transferManagerTest.getFeeReceiverTest()
      expect(receiver).to.equal(account1.address)
    })

    it("should call do transfer with fee > 0", async () => {
      const [owner, account1, account2, account3, account4] = await ethers.getSigners()

      await virtualToken.mint(account1.address, 1000000000000000)
      await virtualToken.mint(account2.address, 1000000000000000)
      await virtualToken.addWhitelist(account1.address)
      await virtualToken.addWhitelist(account2.address)
      await virtualToken.connect(account1).approve(transferManagerTest.address, 1000000000000000)
      await virtualToken.connect(account2).approve(transferManagerTest.address, 1000000000000000)

      const left = libDeal.DealSide(asset, erc20TransferProxy.address, account1.address)

      const right = libDeal.DealSide(asset, erc20TransferProxy.address, account2.address)

      const dealData = libDeal.DealData(
        50000,
        20,
        0, // 0 -> LibFeeSide.LEFT
      )

      await transferManagerTest.checkDoTransfers(left, right, dealData)
    })

    it("should call do transfer where DealData.maxFeeBasePoint is 0", async () => {
      const [owner, account1, account2, account3, account4] = await ethers.getSigners()

      await virtualToken.mint(account1.address, 1000000000000000)
      await virtualToken.mint(account2.address, 1000000000000000)
      await virtualToken.addWhitelist(account1.address)
      await virtualToken.addWhitelist(account2.address)
      await virtualToken.connect(account1).approve(transferManagerTest.address, 1000000000000000)
      await virtualToken.connect(account2).approve(transferManagerTest.address, 1000000000000000)

      const left = libDeal.DealSide(asset, erc20TransferProxy.address, account1.address)

      const right = libDeal.DealSide(asset, erc20TransferProxy.address, account2.address)

      const dealData = libDeal.DealData(
        20,
        0,
        0, // 0 -> LibFeeSide.LEFT
      )

      await transferManagerTest.checkDoTransfers(left, right, dealData)
    })

    it("should set default fee receiver", async () => {
      const [owner, account1, account2, account3, account4, account5] = await ethers.getSigners()
      await transferManagerTest.setDefaultFeeReceiver(account5.address)
    })
  })

  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, matchingEngine.address)
  }
})
