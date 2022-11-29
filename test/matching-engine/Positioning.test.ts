import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require("../order")
import { FakeContract, smock } from "@defi-wonderland/smock"
import { IndexPriceOracle, MarkPriceOracle } from "../../typechain"
import { BigNumber } from "ethers"


describe("Positioning", function () {
  let MatchingEngine
  let matchingEngine
  let VirtualToken
  let virtualToken
  let erc20TransferProxy
  let ERC20TransferProxy
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
  let markPriceFake: FakeContract<MarkPriceOracle>
  let indexPriceFake: FakeContract<IndexPriceOracle>
  let transferManagerTest
  let accountBalance1
  let MarketRegistry
  let marketRegistry
  let BaseToken
  let baseToken
  let TestERC20
  let USDC
  let orderLeft, orderRight
  const deadline = 87654321987654
  let owner, account1, account2, account3, account4, relayer
  const one = ethers.constants.WeiPerEther // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")) // 2e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")) // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")) // 10e18
  const hundred = ethers.constants.WeiPerEther.mul(BigNumber.from("1000000")) // 100e18
  let VolmexPerpPeriphery
  let volmexPerpPeriphery

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery")
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
    // indexPriceOracle = await smock.fake("IndexPriceOracle")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest")
    ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy")
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
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners()
  })

  beforeEach(async () => {
    const [owner, account4] = await ethers.getSigners()

    // markPriceFake = await smock.fake("MarkPriceOracle")
    // indexPriceFake = await smock.fake("IndexPriceOracle")
    // indexPriceOracle.latestRoundData.whenCalledWith(0).returns(['100', '0']);
    // indexPriceOracle.latestRoundData.whenCalledWith(3600).returns(['100', '0']);
    // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

    // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
    // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
    
    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
      initializer: "initialize",
    });
    await indexPriceOracle.deployed();


    // const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

    // for (let index = 0; index < 10; index++) {
    //   await (
    //     await indexPriceOracle.updateBatchVolatilityTokenPrice([0, 1], [1000000, 1000000], [proofHash, proofHash])
    //   ).wait();
    // }

    // await
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
      },
    )
    await volmexBaseToken.deployed()

    markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, [[1000, 1000], [volmexBaseToken.address, volmexBaseToken.address]], {
      initializer: "initialize",
    })
    await markPriceOracle.deployed()

    accountBalance = await smock.fake("AccountBalance")

    baseToken = await smock.fake("VolmexBaseToken")

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit"
    })
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy()

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [])

    USDC = await TestERC20.deploy()
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6)
    await USDC.deployed()

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    )
    await markPriceOracle.setMatchingEngine(matchingEngine.address)

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    })
    await virtualToken.deployed()
    await virtualToken.setMintBurnRole(owner.address);

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
      ],
      {
        initializer: "initialize",
      },
    )
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address])

    // await indexPriceOracle.connect(owner).addIndexDataPoint(0,250000000)
    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address)
    await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6)
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6)
    await matchingEngine.grantMatchOrders(positioning.address)

    await accountBalance1.connect(owner).setPositioning(positioning.address)

    await vault.connect(owner).setPositioning(positioning.address)
    await vault.connect(owner).setVaultController(vaultController.address)
    await vaultController.registerVault(vault.address, virtualToken.address)
    await vaultController.connect(owner).setPositioning(positioning.address)

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(hundred.toString())

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address)
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address)
    await positioning.connect(owner).setPositioning(positioning.address)

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(virtualToken.address, one.toString()),
      Asset(volmexBaseToken.address, two.toString()),
      0,
      0,
      false,
    )

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, two.toString()),
      Asset(virtualToken.address, one.toString()),
      1,
      0,
      true,
    )

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(1000, 0)
    // }

    volmexPerpPeriphery = await upgrades.deployProxy(
      VolmexPerpPeriphery, 
      [
          [positioning.address, positioning.address], 
          [vaultController.address, vaultController.address],
          markPriceOracle.address,
          owner.address,
      ]
    );
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
              0,
            ],
            {
              initializer: "__PositioningTest_init",
            },
          ),
        ).to.be.revertedWith("CH_PCNC")
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
              0,
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
              0,
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
              0,
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
      it("should match orders and open position", async () => {  
        const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, ten.toString())
        await virtualToken.mint(account2.address, ten.toString())
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, ten.toString())
        await virtualToken.connect(account2).approve(vault.address, ten.toString())
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString())
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString())

        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            five.toString(),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            five.toString(),
          )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        )

        await expect(positionSize).to.be.equal("2000000000000000000")
        await expect(positionSize1).to.be.equal("-2000000000000000000")
      })

      it("should match orders and open position with leverage", async () => {  
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, ten.toString())
        await virtualToken.mint(account2.address, ten.toString())
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)

        await virtualToken.connect(account1).approve(vault.address, ten.toString())
        await virtualToken.connect(account2).approve(vault.address, ten.toString())
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString())
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString())


        // await indexPriceOracle.connect(owner).addIndexDataPoint(0,10000000)

        await vaultController.connect(account1).deposit(
          volmexPerpPeriphery.address,
          virtualToken.address, 
          account1.address,
          ten.toString()
        )
        await vaultController.connect(account2).deposit(
          volmexPerpPeriphery.address,
          virtualToken.address, 
          account2.address,
          ten.toString()
        )

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          0,
          0,
          false,
        )
    
        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          1,
          0,
          true,
        )

        const vaultAddress = await vaultController.getVault(virtualToken.address)

        const vaultContract = await vault.attach(vaultAddress)
        let signatureLeft = await getSignature(orderLeftLeverage, account1.address)
        let signatureRight = await getSignature(orderRightLeverage, account2.address)

        // let a = await indexPriceOracle
        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderRightLeverage, signatureRight,orderLeftLeverage, signatureLeft)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        )

        // await expect(positionSize).to.be.equal("2000000000000000000")
        // await expect(positionSize1).to.be.equal("-2000000000000000000")

        // **********************

        // const orderLeftLeverage2x = Order(
        //   ORDER,
        //   deadline,
        //   account1.address,
        //   Asset(virtualToken.address, BigNumber.from("1").mul(one).div(BigNumber.from("10")).toString()),
        //   Asset(volmexBaseToken.address, BigNumber.from("1").mul(one).div(BigNumber.from("10")).toString()),
        //   2,
        //   0,
        //   false,
        // )
    
        // const orderRightLeverage2x = Order(
        //   ORDER,
        //   deadline,
        //   account2.address,
        //   Asset(volmexBaseToken.address, BigNumber.from("1").mul(one).div(BigNumber.from("10")).toString()),
        //   Asset(virtualToken.address, BigNumber.from("1").mul(one).div(BigNumber.from("10")).toString()),
        //   3,
        //   0,
        //   true,
        // )

        // const vaultAddress = await vaultController.getVault(virtualToken.address)

        // const vaultContract = await vault.attach(vaultAddress)
      //   let signatureLeft2x = await getSignature(orderLeftLeverage2x, account1.address)
      //   let signatureRight2x = await getSignature(orderRightLeverage2x, account2.address)

      //   // opening the position here
      //   await expect(positioning.connect(account1).openPosition(orderLeftLeverage2x, signatureLeft2x, orderRightLeverage2x, signatureRight2x)).to.emit(
      //     positioning,
      //     "PositionChanged",
      //   )
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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "1000000000000000000"),
          Asset(virtualToken.address, "2000000000000000000"),
          1,
          0,
          true,
        )

        const orderRight1 = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, "1000000000000000000"),
          Asset(volmexBaseToken.address, "2000000000000000000"),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        )

        await expect(positionSize).to.be.equal("1000000000000000000")
        await expect(positionSize1).to.be.equal("-1000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.connect(account1).openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, virtualToken.address)

        await expect(positionSizeAfter).to.be.equal("0")
      })

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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, one.toString()),
          Asset(virtualToken.address, one.toString()),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, one.toString()),
          Asset(volmexBaseToken.address, one.toString()),
          1,
          0,
          false,
          )

        const orderLeft1 = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(virtualToken.address, one.toString()),
          Asset(volmexBaseToken.address, one.toString()),
          1,
          0,
          false,
        )

        const orderRight1 = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(baseToken.address, "2000"),
          Asset(virtualToken.address, "2000"),
          1,
          0,
          true
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

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

        await expect(positionSize.toString()).to.be.equal("-20000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("20000000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // liquidating the position
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionLiquidated",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        )

        await expect(positionSizeAfter.toString()).to.be.equal("-18000000000000000000000")
      })

      it("should liquidate right order", async () => {
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

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "2000"),
          Asset(virtualToken.address, "2000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "2000"),
          Asset(baseToken.address, "2000"),
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

        await expect(positionSize.toString()).to.be.equal("20000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("-20000000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionLiquidated",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)

        await expect(positionSizeAfter1.toString()).to.be.equal("-18000000000000000000000")
        await expect(positionSizeAfter.toString()).to.be.equal("18000000000000000000000")
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
          0,
          true,
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

        await expect(positionSize.toString()).to.be.equal("-20000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("20000000000000000000000")
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

        await expect(positionSize.toString()).to.be.equal("-10000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("10000000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)

        await expect(positionSizeAfter.toString()).to.be.equal("-8000000000000000000000")
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

        await expect(positionSize.toString()).to.be.equal("-10000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("10000000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)
        await expect(positionSizeAfter.toString()).to.be.equal("0")
        await expect(positionSizeAfter1.toString()).to.be.equal("0")
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
          ORDER,
          10,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          10,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          0,
          0,
          false,
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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft, owner.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.be.revertedWith(
          "V_PERP_M: order signature verification error",
        )
      })

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners()
        await matchingEngine.grantMatchOrders(positioning.address)

        const orderLeft = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          erc1271Test.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
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
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
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
