import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { smock } from "@defi-wonderland/smock"
import { Order, Asset, sign } from "../order"
import { BigNumber } from "ethers";

describe("VolmexPerpLimitOrder", function () {
  let MatchingEngine
  let matchingEngine
  let VirtualToken
  let virtualToken
  let ERC20TransferProxyTest
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
  let VolmexPerpLimitOrder;
  let volmexPerpLimitOrder;
  
  let accountBalance1
  let MarketRegistry
  let marketRegistry
  let BaseToken
  let baseToken
  let TestERC20;
  let USDC;
  let owner, account1, account2, account3, account4;
  const deadline = 87654321987654;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery")
    VolmexPerpLimitOrder = await ethers.getContractFactory("VolmexPerpLimitOrder")
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest")
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest")
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
      ["VirtualToken", "VTK", false],
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

    volmexPerpLimitOrder = await upgrades.deployProxy(
        VolmexPerpLimitOrder,
        [
            markPriceOracle.address,
            positioning.address,
            accountBalance.address,
            owner.address
        ],
        {
            initializer: "initialize"
        }
    )

    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address])
    
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

    for (let i = 0; i < 9; i++) {
      await matchingEngine.addObservation(10000000, 0);
    }
  });

    describe("VolmexPerpLimitOrder deployment", async () => {
        it("should deploy VolmexPerpLimitOrder", async () => {
            volmexPerpLimitOrder = await upgrades.deployProxy(
                VolmexPerpLimitOrder, 
                [
                    markPriceOracle.address,
                    positioning.address,
                    accountBalance.address,
                    owner.address
                ]
            );
            let receipt = await volmexPerpLimitOrder.deployed();
            expect(receipt.confirmations).not.equal(0);
        });
    });

    describe("Set MarkPriceOracle", async () => {
        it("should set MarkPriceOracle", async () => {
            let receipt = await volmexPerpLimitOrder.setMarkPriceOracle(markPriceOracle.address);
            expect(receipt.confirmations).not.equal(0);
        });

        it("should fail to set MarkPriceOracle if not admin", async () => {
            await expect(
                volmexPerpLimitOrder.connect(account2).setMarkPriceOracle(markPriceOracle.address)
            ).to.be.revertedWith("Not Limit Order admin");
        });
    });

    describe("Fill Limit order", async () => {
        it.only("should fill LimitOrder", async () => {
          const orderLeft = Order(
            STOP_LOSS_LIMIT_ORDER,
            deadline,
            ethers.constants.AddressZero,
            Asset(volmexBaseToken.address, two.toString()),
            Asset(virtualToken.address, one.toString()),
            0,
            1e8.toString(),
            true,
          )
      
          const orderRight = Order(
            STOP_LOSS_LIMIT_ORDER,
            deadline,
            ethers.constants.AddressZero,
            Asset(virtualToken.address, one.toString()),
            Asset(volmexBaseToken.address, two.toString()),
            0,
            1e6.toString(),
            false,
          )

          const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
          const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

          console.log("leftSigner: ", account1.address);
          console.log("rightSigner: ", account2.address);

          await matchingEngine.grantMatchOrders(volmexPerpLimitOrder.address);
            
          let receipt = await volmexPerpLimitOrder.fillLimitOrder(
              orderLeft,
              signatureLeftLimitOrder,
              orderRight,
              signatureRightLimitOrder
          );
          expect(receipt.confirmations).not.equal(0);
        });
    });

    async function getSignature(orderObj, signer) {
      return sign(orderObj, signer, volmexPerpLimitOrder.address)
    }
});