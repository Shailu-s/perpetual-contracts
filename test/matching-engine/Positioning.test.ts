import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign, encodeAddress } = require("../order")
import { FakeContract, smock } from "@defi-wonderland/smock"
import { FundingRate, IndexPriceOracle, MarkPriceOracle } from "../../typechain"
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
  let vault, vault2
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
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  
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
  let liquidator

  const one = ethers.constants.WeiPerEther // 1e18
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery")
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
    // fundingRate = await smock.fake("FundingRate")
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
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  })

  beforeEach(async () => {
    liquidator = encodeAddress(owner.address);
    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,  
      [
        owner.address
      ], 
      {
        initializer: "initialize",
      });
    await indexPriceOracle.deployed();

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
    )
    await baseToken.deployed()

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit"
    })
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy()

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [])
    await positioningConfig.deployed();

    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();

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

    vault2 = await upgrades.deployProxy(Vault, [
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

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address)
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6)
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6)
    await matchingEngine.grantMatchOrders(positioning.address)

    await accountBalance1.connect(owner).setPositioning(positioning.address)

    await vault.connect(owner).setPositioning(positioning.address)
    await vault.connect(owner).setVaultController(vaultController.address)
    await vaultController.registerVault(vault.address, virtualToken.address)
    await vaultController.connect(owner).setPositioning(positioning.address)

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(convert("1000000"))

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address)
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address)
    await positioning.connect(owner).setPositioning(positioning.address)

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(virtualToken.address, convert("2400")),
      Asset(volmexBaseToken.address, convert("24")),
      0,
      0,
      false,
    )

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, convert("24")),
      Asset(virtualToken.address, convert("2400")),
      1,
      0,
      true,
    )

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(10000000, 0)
    // }

    volmexPerpPeriphery = await upgrades.deployProxy(
      VolmexPerpPeriphery, 
      [
          [positioning.address, positioning.address], 
          [vaultController.address, vaultController.address],
          markPriceOracle.address,
          [vault.address, vault2.address],
          owner.address,
          relayer.address,
      ]
    );
    deadline
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
            ],
            {
              initializer: "initialize",
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
            ],
            {
              initializer: "initialize",
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
            ],
            {
              initializer: "initialize",
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
            ],
            {
              initializer: "initialize",
            },
          ),
        ).to.be.revertedWith("CH_MENC")
      })
    })
  })

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should match orders and open position", async () => {  
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.emit(
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

        await expect(positionSize).to.be.equal(convert("24"))
        await expect(positionSize1).to.be.equal(convert("-24"))
      })

      it("should match orders and open position with leverage", async () => {  
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)

        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        await vaultController.connect(account1).deposit(
          volmexPerpPeriphery.address, 
          virtualToken.address, 
          account1.address,
          convert("1000")
        )
        await vaultController.connect(account2).deposit(
          volmexPerpPeriphery.address,
          virtualToken.address, 
          account2.address,
          convert("1000")
        )

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2400")),
          Asset(volmexBaseToken.address, convert("24")),
          0,
          0,
          false,
        )
    
        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("24")),
          Asset(virtualToken.address, convert("2400")),
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
        await expect(positioning.connect(account1).
          openPosition(
            orderLeftLeverage, 
            signatureLeft, 
            orderRightLeverage, 
            signatureRight, 
            liquidator
          )
        ).to.emit(
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

        await expect(positionSize.toString()).to.be.equal(convert("24"))
        await expect(positionSize1.toString()).to.be.equal(convert("-24"))
      })

      it("should close whole position of both traders", async () => {
        for (let i = 0; i < 9; i++) {
          await matchingEngine.addObservation(10000000, 0);
        }

        // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);

        await matchingEngine.grantMatchOrders(positioning.address);


        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)

        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))

        await vaultController.connect(account1).deposit(
          volmexPerpPeriphery.address, 
          virtualToken.address, 
          account1.address,
          convert("1000")
        )
        await vaultController.connect(account2).deposit(
          volmexPerpPeriphery.address,
          virtualToken.address, 
          account2.address,
          convert("1000")
        )

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          1,
          0,
          true,
        )

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.emit(
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

        await expect(positionSize).to.be.equal("24000000000000000000")
        await expect(positionSize1).to.be.equal("-24000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        // reducing the position here
        await expect(positioning.connect(account1).openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, virtualToken.address)

        await expect(positionSizeAfter).to.be.equal("0")
      })

      it("should liquidate left trader", async () => {
        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.addWhitelist(vault.address)
        await virtualToken.addWhitelist(vaultController.address)

        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))

        // volmexPerpPeriphery.address, USDC.address, alice.address, amount
        await vaultController.connect(account1).deposit(
          volmexPerpPeriphery.address, 
          virtualToken.address, 
          account1.address,
          convert("1000")
        )
        await vaultController.connect(account2).deposit(
          volmexPerpPeriphery.address,
          virtualToken.address, 
          account2.address,
          convert("1000")
        )

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("5")),
          Asset(virtualToken.address,  convert("500")),
          1,
          0,
          true,
        )

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address,  convert("500")),
          Asset(volmexBaseToken.address,  convert("5")),
          2,
          0,
          false,
        )
        // var arr = await indexPriceOracle.getIndexDataPoints(0);
        // console.log("Index 0");
        // for (var i = 0; i < arr.length; i++) {
        //   console.log(arr[i].toString());
        // }
        // arr = await indexPriceOracle.getIndexDataPoints(1);
        // console.log("Index 1");
        // for (var i = 0; i < arr.length; i++) {
        //   console.log(arr[i].toString());
        // }
        
        let signatureLeft = await getSignature(orderLeft1, account1.address)
        let signatureRight = await getSignature(orderRight1, account2.address)

        console.log("\nBefore");
        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        console.log("Opening position 1");

        await expect(positioning.openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        )
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        )

        await expect(positionSize.toString()).to.be.equal(convert("-5"))
        await expect(positionSize1.toString()).to.be.equal(convert("5"))

        console.log("\nAfter");
        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        // Index price increase
        await indexPriceOracle.addIndexDataPoint(0, 300 * 1e6);
        await indexPriceOracle.addIndexDataPoint(1, 300 * 1e6);

        console.log("\nAfter index price updated to 200");
        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        // console.log("latestRoundData");
        // const ans = await indexPriceOracle.latestRoundData(0);
        // console.log("ans: ", ans[0].toString());

        // const ans1 = await indexPriceOracle.latestRoundData(1);
        // console.log("ans1: ", ans1[0].toString());


        const orderLeftNew = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("1600")),
          Asset(volmexBaseToken.address, convert("8")),
          3,
          0,
          false,
        )

        const orderRightNew = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address,  convert("8")),
          Asset(virtualToken.address,  convert("1600")),
          4,
          0,
          true,
        )
        
        let signatureLeft1 = await getSignature(orderLeftNew, account1.address)
        let signatureRight1 = await getSignature(orderRightNew, account2.address)

        const USDCVaultAddress = await vaultController.getVault(virtualToken.address)

        const USDCVaultContract = await vault.attach(USDCVaultAddress)

        await USDCVaultContract.setPositioning(positioning.address)

        await accountBalance1.grantSettleRealizedPnlRole(vaultController.address);

        await positioning.openPosition(orderLeftNew, signatureLeft1, orderRightNew, signatureRight1, liquidator);
        const positionSize2 = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        )
        const positionSize3 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        )

        console.log("account1: ", account1.address, positionSize2.toString());
        console.log("account2: ", account2.address, positionSize3.toString());

        console.log("\nAfter 2nd position open");
        await indexPriceOracle.addIndexDataPoint(0, "800" + "000000");
        await indexPriceOracle.addIndexDataPoint(1, "800" + "000000");

        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        console.log("Account 1 liquidatable: ", (await positioning.isAccountLiquidatable(account1.address)));
        console.log("Account 2 liquidatable: ", (await positioning.isAccountLiquidatable(account2.address)));

        // return;

        // Short order -> convert to long order without signature
        // Normal order -> match

        console.log("Opening positiong 2");

        // liquidating the position
        await expect(positioning.openPosition(orderLeftNew, signatureLeft1, orderRightNew, signatureRight1, liquidator)).to.emit(
          positioning,
          "PositionLiquidated",
        )

        

        // Check liquidator pnl after liquidation
        // check position size
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        )

        console.log("Postion size after: ", positionSizeAfter.toString());

        await expect(positionSizeAfter.toString()).to.be.equal("0")
      })

      it("should liquidate right order", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

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
          deadline,
          false,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        )

        const orderRight = Order(
          account2.address,
          deadline,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        )

        const orderLeft1 = Order(
          account1.address,
          deadline,
          true,
          Asset(baseToken.address, "2000"),
          Asset(virtualToken.address, "2000"),
          1,
        )

        const orderRight1 = Order(
          account2.address,
          deadline,
          false,
          Asset(virtualToken.address, "2000"),
          Asset(baseToken.address, "2000"),
          1,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.emit(
          positioning,
          "PositionChanged",
        )

        const positionSize = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSize1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)

        await expect(positionSize.toString()).to.be.equal("20000000000000000000000")
        await expect(positionSize1.toString()).to.be.equal("-20000000000000000000000")

        let signatureLeft1 = await getSignature(orderLeft1, account1.address)
        let signatureRight1 = await getSignature(orderRight1, account2.address)

        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator)).to.emit(
          positioning,
          "PositionLiquidated",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address)

        await expect(positionSizeAfter1.toString()).to.be.equal("-18000000000000000000000")
        await expect(positionSizeAfter.toString()).to.be.equal("18000000000000000000000")
      })

      it("should close the whole position", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("2")),
          0,
          0,
          false,
        )
    
        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("200")),
          1,
          0,
          true,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.emit(
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

        await expect(positionSize).to.be.equal(convert("2"))
        await expect(positionSize1).to.be.equal(convert("-2"))

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2")),
          Asset(volmexBaseToken.address, convert("200")),
          0,
          0,
          false,
        )
    
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("200")),
          Asset(virtualToken.address, convert("2")),
          1,
          0,
          true,
        )

        let signatureLeft1 = await getSignature(orderLeft1, account2.address)
        let signatureRight1 = await getSignature(orderRight1, account1.address)

        // reducing the position here
        await expect(positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator)).to.emit(
          positioning,
          "PositionChanged",
        )
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, orderLeft1.makAsset.virtualToken)
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, orderLeft1.makAsset.virtualToken)
        await expect(positionSizeAfter.toString()).to.be.equal("0")
        await expect(positionSizeAfter1.toString()).to.be.equal("0")
      })

      it("test for get all funding payment", async () => {
        const [owner, account1, account2] = await ethers.getSigners()

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

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))

        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2400")),
          Asset(baseToken.address, convert("24")),
          0,
          0,
          false,
        )
    
        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(baseToken.address, convert("24")),
          Asset(virtualToken.address, convert("2400")),
          1,
          0,
          true,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.be.revertedWith(
          "V_PERP: Basetoken not registered at market",
        )
      })

      it("failure for opening with zero amount", async () => {
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("0")),
          Asset(volmexBaseToken.address, convert("0")),
          0,
          0,
          false,
        )
    
        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("0")),
          Asset(virtualToken.address, convert("0")),
          1,
          0,
          true,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.be.revertedWith(
          "division by zero",
        )
      })

      it("failure for liquidation with wrong amount", async () => {
        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))

        await vaultController.connect(account1).deposit(
          volmexPerpPeriphery.address, 
          virtualToken.address, 
          account2.address, 
          convert("1000"),)
        await vaultController.connect(account2).deposit(
          volmexPerpPeriphery.address, 
          virtualToken.address, 
          account2.address, 
          convert("1000"),)

        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2400")),
          Asset(volmexBaseToken.address, convert("24")),
          0,
          0,
          false,
        )
    
        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("24")),
          Asset(virtualToken.address, convert("2400")),
          1,
          0,
          true,
        )

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("24")),
          Asset(volmexBaseToken.address, convert("2400")),
          0,
          0,
          false,
        )
    
        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2400")),
          Asset(virtualToken.address, convert("24")),
          1,
          0,
          true,
        )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        // opening the position here
        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.emit(
          positioning,
          "PositionChanged",
        )

        let signatureLeft1 = await getSignature(orderLeft1, account2.address)
        let signatureRight1 = await getSignature(orderRight1, account1.address)

        // trying to liquidate here
        await expect(
          positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.be.revertedWith("P_WTV")
      })
      it("failure not enough free collateral", async () => {
        await virtualToken.mint(account1.address, 1000000000000000)
        await virtualToken.mint(account2.address, 1000000000000000)
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000)
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000)

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.be.revertedWith(
          "CH_NEFCI",
        )
        // This test should be moved to MatchingEngine.test.ts
        xit("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
          const orderLeft = Order(
            account1.address,
            deadline,
            true,
            Asset(baseToken.address, "20"),
            Asset(virtualToken.address, "20"),
            1,
          )

          const orderRight = Order(
            account2.address,
            deadline,
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
        const orderLeft1 = {...orderLeft}
        orderLeft1.deadline = 10;
        const orderRight1 = {...orderRight}
        orderRight1.deadline = 10;
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        let signatureLeft = await getSignature(orderLeft1, account1.address)
        let signatureRight = await getSignature(orderRight1, account2.address)

        // opening the position here
        await expect(positioning.connect(account1).openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator)).to.be.revertedWith(
          "'V_PERP_M: Order deadline validation failed"
        );
      })
      it("should fail to match orders as maker is not transaction sender", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        let signatureLeft = await getSignature(orderLeft, account1.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.be.revertedWith(
          "V_PERP_M: maker is not tx sender",
        )
      })
      it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))
        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft, owner.address)
        let signatureRight = await getSignature(orderRight, account2.address)

        await expect(positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator)).to.be.revertedWith(
          "V_PERP_M: order signature verification error",
        )
      })

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        await matchingEngine.grantMatchOrders(positioning.address)

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight = Order(
          ORDER,
          deadline,
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
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: order verification failed")
      })

      it("should fail to match orders as order maker is contract but signature cannot be verified", async () => {
        erc1271Test = await ERC1271Test.deploy()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(erc1271Test.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.approveTest(erc1271Test.address, vault.address, convert("1000"));
        await virtualToken.approveTest(erc1271Test.address, volmexPerpPeriphery.address, convert("1000"));

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(erc1271Test.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(erc1271Test.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))

        
        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            erc1271Test.address, 
            convert("1000"),
          )


        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight1 = Order(
          ORDER,
          deadline,
          erc1271Test.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft1, account1.address)
        let signatureRight = await getSignature(orderRight1, account2.address)

        await expect(
          positioning.connect(account1).openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: contract order signature verification error")
      })
      it("should fail to match orders & revert as order is cancelled", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"))
        await virtualToken.mint(account2.address, convert("1000"))
        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(account2.address)
        await virtualToken.connect(account1).approve(vault.address, convert("1000"))
        await virtualToken.connect(account2).approve(vault.address, convert("1000"))
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"))
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"))

        await vaultController.connect(account1)
          .deposit(
            volmexPerpPeriphery.address, 
            virtualToken.address, 
            account1.address, 
            convert("1000"),
          )
        await vaultController.connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address, 
            account2.address, 
            convert("1000"),
          )

        await positioning.connect(account1).setMakerMinSalt(100)

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        )

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        )

        let signatureLeft = await getSignature(orderLeft1, account1.address)
        let signatureRight = await getSignature(orderRight1, account2.address)

        await expect(positioning.openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator)).to.be.revertedWith(
          "V_PERP_M: Order canceled",
        )
      })
      it("wrong market registry", async () => {
        await expect(positioning.connect(owner).setMarketRegistry(account1.address)).to.be.revertedWith("V_VPMM")
      })
    })
  })
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address)
  }
  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
})
