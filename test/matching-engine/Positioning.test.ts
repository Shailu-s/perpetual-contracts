import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require("../order")
import { FakeContract, smock } from "@defi-wonderland/smock"
import { AccountBalance, IndexPriceOracle, MarkPriceOracle } from "../../typechain"

describe.only("Positioning", function () {
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
    let ExchangeTest;
    let exchangeTest;
  let accountBalance1
  let MarketRegistry
  let marketRegistry
  let BaseToken
  let baseToken

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
    MarketRegistry = await ethers.getContractFactory("MarketRegistry")
    AccountBalance = await ethers.getContractFactory("AccountBalance")
    BaseToken = await ethers.getContractFactory("VolmexBaseToken")
  })

  beforeEach(async () => {
    const [owner, account4] = await ethers.getSigners()

    markPriceFake = await smock.fake("MarkPriceOracle")
    indexPriceFake = await smock.fake("IndexPriceOracle")
    accountBalance = await smock.fake("AccountBalance")
    baseToken = await smock.fake("VolmexBaseToken")

    erc20TransferProxy = await ERC20TransferProxyTest.deploy()
    erc1271Test = await ERC1271Test.deploy()
    community = account4.address

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [])

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [erc20TransferProxy.address, 300, community, owner.address, indexPriceFake.address],
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

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address])

    vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

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
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address])
    
    await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6)
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6)

    await accountBalance1.connect(owner).setPositioning(positioning.address)

    await vault.connect(owner).setPositioning(positioning.address)
    await vault.connect(owner).setVaultController(vaultController.address)
    await vaultController.registerVault(vault.address, virtualToken.address)
    await vaultController.connect(owner).setPositioning(positioning.address)

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(1000000)

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address)
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address)
    await positioning.connect(owner).setPositioning(positioning.address)
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

    describe("Failure in deployment", function () {
      it("wrong position config", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await expect(
          upgrades.deployProxy(
            Positioning,
            [
              account1.address,
              vaultController.address,
              accountBalance1.address,
              matchingEngine.address,
              markPriceFake.address,
              indexPriceFake.address,
            ],
            {
              initializer: "__PositioningTest_init",
            },
          ),
        ).to.be.revertedWith("CH_CCNC")
      })

      it("wrong vault controller", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await expect(
          upgrades.deployProxy(
            Positioning,
            [
              positioningConfig.address,
              account1.address,
              accountBalance1.address,
              matchingEngine.address,
              markPriceFake.address,
              indexPriceFake.address,
            ],
            {
              initializer: "__PositioningTest_init",
            },
          ),
        ).to.be.revertedWith("CH_VANC")
      })

      it("wrong account balance", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await expect(
          upgrades.deployProxy(
            Positioning,
            [
              positioningConfig.address,
              vaultController.address,
              account1.address,
              matchingEngine.address,
              markPriceFake.address,
              indexPriceFake.address,
            ],
            {
              initializer: "__PositioningTest_init",
            },
          ),
        ).to.be.revertedWith("CH_ABNC")
      })

      it("wrong matching engine", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await expect(
          upgrades.deployProxy(
            Positioning,
            [
              positioningConfig.address,
              vaultController.address,
              accountBalance1.address,
              account1.address,
              markPriceFake.address,
              indexPriceFake.address,
            ],
            {
              initializer: "__PositioningTest_init",
            },
          ),
        ).to.be.revertedWith("CH_MENC")
      })
    })
  })

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should liquidate left trader", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSize1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)

        await expect(positionSize.toNumber()).to.be.equal(20000)
        await expect(positionSize1.toNumber()).to.be.equal(-20000)

        let signatureLeft1 = await getSignature(orderLeft, account1.address)
        let signatureRight1 = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft1, orderRight, signatureRight1)).to.emit(
          positioning,
          "PositionLiquidated",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)

        await expect(positionSizeAfter1.toNumber()).to.be.equal(-18000)
        await expect(positionSizeAfter.toNumber()).to.be.equal(18000)
      })

      it("should match orders and open position", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        )

        await expect(positionSize.toNumber()).to.be.equal(-20000)
        await expect(positionSize1.toNumber()).to.be.equal(20000)
      })

      it("should reduce position of both traders", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        )

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "2000"),
          Asset(baseToken.address, "2000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "2000"),
          Asset(virtualToken.address, "2000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        )

        await expect(positionSize.toNumber()).to.be.equal(-10000)
        await expect(positionSize1.toNumber()).to.be.equal(10000)

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)

        await expect(positionSizeAfter.toNumber()).to.be.equal(-8000)
      })

      it("should close the whole position", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        )

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        )

        await expect(positionSize.toNumber()).to.be.equal(-10000)
        await expect(positionSize1.toNumber()).to.be.equal(10000)

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)
        await expect(positionSizeAfter.toNumber()).to.be.equal(0)
        await expect(positionSizeAfter1.toNumber()).to.be.equal(0)
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
      it("test for settle all funding", async () => {
        const [owner, account1, account2] = await ethers.getSigners()
        await positioning.settleAllFunding(account1.address)
      })
    })
    describe("failure", function () {
      it("failure for wrong basetoken given", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          " V_PERP: Basetoken is not registered in market",
        )
      })

      it("failure for opening with zero amount", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "0"),
          Asset(virtualToken.address, "0"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "0"),
          Asset(baseToken.address, "0"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "division by zero",
        )
      })

      it("failure for liquidation with wrong amount", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 12000)
        await vaultController.connect(account2).deposit(virtualToken.address, 12000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        )

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // trying to liquidate here
        await expect(
          positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1),
        ).to.be.revertedWith("P_WTV")
      })
      it("failure not enough free collateral", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        markPriceFake.getCumulativePrice.returns(10)
        await baseToken.getIndexPrice.returns(2)
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "CH_NEFCI",
        )
        it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
          const [owner, account1, account2] = await ethers.getSigners()
  
          const orderLeft = Order(
            account1.address,
            87654321987654,
            true,
            Asset(baseToken.address, "20"),
            Asset(virtualToken.address, "20"),
            1
          )
  
          const orderRight = Order(
            account2.address,
            87654321987654,
            false,
            Asset(virtualToken.address, "20"),
            Asset(baseToken.address, "20"),
            1
          )
  
          let signatureLeft = await getSignature(orderLeft, owner.address)
          let signatureRight = await getSignature(orderRight, account2.address)
  
          await expect(
            matchingEngine.matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
          ).to.be.revertedWith("V_PERP_M: order signature verification error")
        })
      })
      it("should fail to match orders as deadline has expired", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          10,
          true,
          Asset(baseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          10,
          false,
          Asset(virtualToken.address, "20"),
          Asset(baseToken.address, "20"),
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
          Asset(baseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(baseToken.address, "20"),
          0,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: maker is not tx sender",
        )
      })
      // it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
      //   const [owner, account1, account2] = await ethers.getSigners()

      //   const orderLeft = Order(
      //     account1.address,
      //     87654321987654,
      //     true,
      //     Asset(baseToken.address, "20"),
      //     Asset(virtualToken.address, "20"),
      //     1,
      //   )

      //   const orderRight = Order(
      //     account2.address,
      //     87654321987654,
      //     false,
      //     Asset(virtualToken.address, "20"),
      //     Asset(baseToken.address, "20"),
      //     1,
      //   )

      //   let signatureLeft = await getSignature(orderLeft, owner.address)
      //   let signatureRight = await getSignature(orderRight, account2.address)

      //   await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
      //     "V_PERP_M: order signature verification error",
      //   )
      // })

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(baseToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account3.address)

        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight),
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
          Asset(baseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          erc1271Test.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(baseToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight),
        ).to.be.revertedWith("V_PERP_M: contract order signature verification error")
      })
      it("should fail to match orders & revert as order is cancelled", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        await positioning.connect(account1).setMakerMinSalt(100)

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20"),
          Asset(baseToken.address, "20"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: Order canceled",
        )
      })
      it("wrong market registry", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()
        await expect(positioning.connect(owner).setMarketRegistry(account1.address)).to.be.revertedWith("V_VPMM")
      })
    })
  })
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address)
  }
})
