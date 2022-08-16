import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require("../order")
import { FakeContract, smock } from "@defi-wonderland/smock"
import { AccountBalance, IndexPriceOracle, MarkPriceOracle } from "../../typechain"

describe("Positioning", function () {
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
  let Positioning
  let positioning
  let PositioningConfig
  let positioningConfig
  let Vault
  let vault
  let VaultController
  let vaultController
  let AccountBalance
  let markPriceFake: FakeContract<MarkPriceOracle>
  let indexPriceFake: FakeContract<IndexPriceOracle>
  let accountBalance: FakeContract<AccountBalance>
  let transferManagerTest
  let accountBalance1

  this.beforeAll(async () => {
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    VirtualToken = await ethers.getContractFactory("VirtualToken")
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest")
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest")
    ERC1271Test = await ethers.getContractFactory("ERC1271Test")
    Positioning = await ethers.getContractFactory("PositioningTest")
    PositioningConfig = await ethers.getContractFactory("PositioningConfig")
    Vault = await ethers.getContractFactory("Vault")
    VaultController = await ethers.getContractFactory("VaultController")

    AccountBalance = await ethers.getContractFactory("AccountBalance")
  })

  beforeEach(async () => {
    const [owner, account1, account2, account3, account4] = await ethers.getSigners()

    markPriceFake = await smock.fake("MarkPriceOracle")
    indexPriceFake = await smock.fake("IndexPriceOracle")
    accountBalance = await smock.fake("AccountBalance")

    erc20TransferProxy = await ERC20TransferProxyTest.deploy()
    erc1271Test = await ERC1271Test.deploy()
    community = account4.address

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [])

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

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
      false,
    ])

    transferManagerTest = await upgrades.deployProxy(TransferManagerTest, [1, community], {
      initializer: "__TransferManager_init",
    })

    vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance.address])

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address])

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        markPriceFake.address,
        indexPriceFake.address,
      ],
      {
        initializer: "__PositioningTest_init",
      },
    )

    await accountBalance1.connect(owner).setPositioning(positioning.address)
    await vaultController.connect(owner).setPositioning(positioning.address)
    await vault.setPositioning(positioning.address)
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
  })

  describe("Deployment", function () {
    it("MatchingEngine deployed confirm", async () => {
      let receipt = await matchingEngine.deployed()
      expect(receipt.confirmations).not.equal(0)
    })
    it("Positioning deployed confirm", async () => {
      let receipt = await positioning.deployed()
      expect(receipt.confirmations).not.equal(0)
    })
  })

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should match orders & emit event", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        indexPriceFake.getIndexTwap.returns(20)
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
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(positioning, "PositionChanged")
      })

      it("should match orders & emit event when maker address is 0", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        indexPriceFake.getIndexTwap.returns(20)

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
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.emit(positioning, "PositionChanged")
      })
      
      it("test for get all funding payment", async () => {
        const [owner, account1, account2] = await ethers.getSigners()
        markPriceFake.getCumulativePrice.returns(25)
        indexPriceFake.getIndexTwap.returns(20)

        expect(await positioning.getAllPendingFundingPayment(account1.address)).to.be.equal(0)
      })
      it("test for getters", async () => {
        expect(await positioning.getVaultController()).to.be.equal(vaultController.address)
        expect(await positioning.getPositioningConfig()).to.be.equal(positioningConfig.address)
        expect(await positioning.getAccountBalance()).to.be.equal(accountBalance1.address)
      })
    })
    describe("failure", function () {
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

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: Order deadline validation failed",
        )
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
          0,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: maker is not tx sender",
        )
      })
      it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

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

        let signatureLeft = await getSignature(orderLeft, owner.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: order signature verification error",
        )
      })

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account3.address)

        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: order verification failed",
        )
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

        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: contract order signature verification error",
        )
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

        await positioning.connect(account1).setMakerMinSalt(100)
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith("V_PERP_M: Order canceled")
      })
    })
  })
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address)
  }
})
