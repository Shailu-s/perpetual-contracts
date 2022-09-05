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
  let positioning2
  let PositioningConfig
  let positioningConfig
  let Vault
  let vault
  let VaultController
  let vaultController
  let vaultController2
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
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery")
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
    vaultController2 = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

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

    positioning2 = await upgrades.deployProxy(
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
  });

    describe("VolmexPerpPeriphery deployment", async () => {
        it("should deploy VolmexPerpPeriphery", async () => {
            volmexPerpPeriphery = await upgrades.deployProxy(
                VolmexPerpPeriphery, 
                [
                    [positioning.address, positioning2.address], 
                    [vaultController.address, vaultController2.address],
                    owner.address,
                ]
            );
            let receipt = await volmexPerpPeriphery.deployed();
            expect(receipt.confirmations).not.equal(0);
        });
    });

    describe("Add positioning", async () => {
        it("should add another Positioning", async () => {
            let receipt = await volmexPerpPeriphery.addPositioning(positioning.address);
            expect(receipt.confirmations).not.equal(0);
        });

        it("should fail to add another Positioning if not admin", async () => {
            await expect(
                volmexPerpPeriphery.connect(account2).addPositioning(positioning.address)
            ).to.be.revertedWith("VolmexPerpPeriphery: Not admin");
        });
    });

    describe("Add vaultController", async () => {
        it("should add another VaultController", async () => {
            let receipt = await volmexPerpPeriphery.addVaultController(vaultController.address);
            expect(receipt.confirmations).not.equal(0);
        });

        it("should fail to add another VaultController if not admin", async () => {
            await expect(
                volmexPerpPeriphery.connect(account2).addVaultController(vaultController.address)
            ).to.be.revertedWith("VolmexPerpPeriphery: Not admin");
        });
    });
});