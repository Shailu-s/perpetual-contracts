import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require("../order")
import { FakeContract, smock } from "@defi-wonderland/smock"
import { AccountBalance, IndexPriceOracle, MarkPriceOracle } from "../../typechain"
import { BigNumber } from "ethers";

describe("Positioning", function () {
  let MatchingEngine
  let matchingEngine
  let VirtualToken
  let virtualToken
  let erc20TransferProxy
  let ERC20TransferProxyTest
  let TransferManagerTest
  let ERC1271Test
  let erc1271Test
  let Positioning
  let positioning
  let PositioningConfig
  let positioningConfig
  let Vault
  let vault
  let VaultController
  let vaultController
  let AccountBalance
  let accountBalance
  let MarkPriceOracle
  let markPriceOracle
  let IndexPriceOracle
  let indexPriceOracle
  let VolmexBaseToken
  let volmexBaseToken  
  
  let transferManagerTest
    let ExchangeTest;
    let exchangeTest;
  let accountBalance1
  let MarketRegistry
  let marketRegistry
  let BaseToken
  let baseToken
  let TestERC20;
  let USDC;
  let orderLeft, orderRight;
  const deadline = 87654321987654;
  let owner, account1, account2, account3, account4;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  this.beforeAll(async () => {
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest")
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
    TestERC20 = await ethers.getContractFactory("TestERC20")
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
  })

  beforeEach(async () => {
    const [owner, account4] = await ethers.getSigners()

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [
        owner.address,
      ],
      { 
        initializer: "initialize",
      }
    );

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      }
    );
    await volmexBaseToken.deployed();

    markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, 
      [
        [1000000],
        [volmexBaseToken.address]
      ],
      { 
        initializer: "initialize",
      }
    );
    await markPriceOracle.deployed();

    accountBalance = await smock.fake("AccountBalance")
    baseToken = await smock.fake("VolmexBaseToken")

    erc20TransferProxy = await ERC20TransferProxyTest.deploy()
    erc1271Test = await ERC1271Test.deploy()

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [])

    USDC = await TestERC20.deploy()
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6)
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, 
      [
        USDC.address,
        owner.address,
        markPriceOracle.address,
      ],
      {
        initializer: "__MatchingEngineTest_init"
      }
    );
    await markPriceOracle.setMatchingEngine(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(
      VirtualToken,
      ["VirtualToken", "VTK", true],
      {
        initializer: "initialize"
      }
    );
    await virtualToken.deployed();

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
      false,
    ])

    transferManagerTest = await upgrades.deployProxy(TransferManagerTest, [erc20TransferProxy.address, owner.address], {
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
        markPriceOracle.address,
        indexPriceOracle.address,
        0
      ],
      {
        initializer: "initialize",
      },
    )
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address])
    
    await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address)
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

    orderLeft = Order(
      account1.address,
      deadline,
      true,
      Asset(virtualToken.address, one.toString()),
      Asset(volmexBaseToken.address, two.toString()),
      1
    )

    orderRight = Order(
      account2.address,
      deadline,
      false,
      Asset(volmexBaseToken.address, one.toString()),
      Asset(virtualToken.address, two.toString()),
      2,
    )

    for (let i = 0; i < 9; i++) {
      await matchingEngine.addObservation(10000000, 0);
    }
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
      it("should match orders and open position", async () => {  
        const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

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

        await expect(positionSize).to.be.equal("-500000000000000000")
        await expect(positionSize1).to.be.equal("500000000000000000")
      })

      it("should reduce position of both traders", async () => {
        for (let i = 0; i < 9; i++) {
          await matchingEngine.addObservation(10000000, 0);
        }

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        await vaultController.connect(account1).deposit(virtualToken.address, 25000)
        await vaultController.connect(account2).deposit(virtualToken.address, 25000)

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "1000000000000000000"),
          Asset(volmexBaseToken.address, "2000000000000000000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          false,
          Asset(volmexBaseToken.address, "1000000000000000000"),
          Asset(virtualToken.address, "2000000000000000000"),
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

        await expect(positionSize).to.be.equal("-500000000000000000")
        await expect(positionSize1).to.be.equal("500000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, virtualToken.address)

        await expect(positionSizeAfter).to.be.equal("-1000000000000000000")
      })

      it("should close the whole position", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

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
          Asset(baseToken.address, one.toString()),
          Asset(virtualToken.address, one.toString()),
          1,
        )

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, one.toString()),
          Asset(baseToken.address, one.toString()),
          1,
        )

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, one.toString()),
          Asset(baseToken.address, one.toString()),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, one.toString()),
          Asset(virtualToken.address, one.toString()),
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

        await expect(positionSize).to.be.equal("-1000000000000000000")
        await expect(positionSize1).to.be.equal("1000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, virtualToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, virtualToken.address)
        await expect(positionSizeAfter).to.be.equal("0")
        await expect(positionSizeAfter1).to.be.equal("0")
      })

      it("test for get all funding payment", async () => {
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
        await matchingEngine.grantMatchOrders(positioning.address);

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
