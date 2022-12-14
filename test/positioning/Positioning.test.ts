import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { FundingRate, IndexPriceOracle, MarkPriceOracle } from "../../typechain";
import { BigNumber } from "ethers";

describe("Positioning", function () {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxy;
  let TransferManagerTest;
  let ERC1271Test;
  let erc1271Test;
  let Positioning;
  let positioning;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let accountBalance;
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let markPriceFake: FakeContract<MarkPriceOracle>;
  let indexPriceFake: FakeContract<IndexPriceOracle>;
  let VolmexBaseToken;
  let volmexBaseToken;
>>>>>>> development:test/positioning/Positioning.test.ts
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
  const one = ethers.constants.WeiPerEther // 1e18
=======
  let transferManagerTest;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let orderLeft, orderRight;
  const deadline = 87654321987654;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;

  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")); // 10e18
  const nine = ethers.constants.WeiPerEther.mul(BigNumber.from("9000")); // 10e18

  const hundred = ethers.constants.WeiPerEther.mul(BigNumber.from("1000000")); // 100e18
>>>>>>> development:test/positioning/Positioning.test.ts
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery")
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
=======
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    // indexPriceOracle = await smock.fake("IndexPriceOracle")
    // indexPriceFake = await smock.fake("IndexPriceOracle")
    // markPriceFake = await smock.fake("IndexPriceOracle")

>>>>>>> development:test/positioning/Positioning.test.ts
    // fundingRate = await smock.fake("FundingRate")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    ERC1271Test = await ethers.getContractFactory("ERC1271Test");
    Positioning = await ethers.getContractFactory("PositioningTest");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    BaseToken = await ethers.getContractFactory("VolmexBaseToken");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  });

  beforeEach(async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    liquidator = encodeAddress(owner.address);
    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,  
      [
        owner.address
      ], 
      {
        initializer: "initialize",
      });
=======
    const [owner, account4] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);

    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
      initializer: "initialize",
    });
>>>>>>> development:test/positioning/Positioning.test.ts
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
    );
    await volmexBaseToken.deployed();

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [
        [1000, 1000],
        [volmexBaseToken.address, volmexBaseToken.address],
>>>>>>> development:test/positioning/Positioning.test.ts
      ],
      {
        initializer: "initialize",
      },
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    )
    await baseToken.deployed()
=======
    );
    await markPriceOracle.deployed();

    baseToken = await smock.fake("VolmexBaseToken");
>>>>>>> development:test/positioning/Positioning.test.ts

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit",
    });
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, []);
    await positioningConfig.deployed();

    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    )

    await markPriceOracle.setMatchingEngine(matchingEngine.address)
=======
    matchingEngine = await upgrades.deployProxy(MatchingEngine, [owner.address, markPriceOracle.address], {
      initializer: "__MatchingEngineTest_init",
    });
>>>>>>> development:test/positioning/Positioning.test.ts

    await markPriceOracle.setMatchingEngine(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", true], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
      false,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
      false,
    ])

    transferManagerTest = await upgrades.deployProxy(TransferManagerTest, [erc20TransferProxy.address, owner.address], {
      initializer: "__TransferManager_init",
    });

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address]);

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
    );
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address)
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6)
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6)
    await matchingEngine.grantMatchOrders(positioning.address)
=======
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
    await matchingEngine.grantMatchOrders(positioning.address);
>>>>>>> development:test/positioning/Positioning.test.ts

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(convert("1000000"))
=======
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(hundred.toString());
>>>>>>> development:test/positioning/Positioning.test.ts

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(virtualToken.address, convert("2400")),
      Asset(volmexBaseToken.address, convert("24")),
      0,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, convert("24")),
      Asset(virtualToken.address, convert("2400")),
      1,
      0,
      true,
    );

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(10000000, 0)
    // }

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      [positioning.address, positioning.address],
      [vaultController.address, vaultController.address],
      markPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
  });

  describe.skip("Deployment", function () {
>>>>>>> development:test/positioning/Positioning.test.ts
    it("MatchingEngine deployed confirm", async () => {
      let receipt = await matchingEngine.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("Positioning deployed confirm", async () => {
      let receipt = await positioning.deployed();
      expect(receipt.confirmations).not.equal(0);
    });

    describe("Failure in deployment", function () {
      it("wrong position config", async () => {
        const [owner, account1, account2] = await ethers.getSigners();
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
        ).to.be.revertedWith("P_PCNC");
      });

      it("wrong vault controller", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

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
        ).to.be.revertedWith("P_VANC");
      });

      it("wrong account balance", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

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
        ).to.be.revertedWith("P_ABNC");
      });

      it("wrong matching engine", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

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
        ).to.be.revertedWith("P_MENC");
      });
    });
  });

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should match orders and open position", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());
>>>>>>> development:test/positioning/Positioning.test.ts

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account1.address, five.toString());
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account2.address, five.toString());

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
        await expect(positionSize).to.be.equal(convert("24"))
        await expect(positionSize1).to.be.equal(convert("-24"))
      })

      it("should match orders and open position with leverage", async () => {  
=======
        await expect(positionSize).to.be.equal("5000000000000000000");
        await expect(positionSize1).to.be.equal("-5000000000000000000");
      });

      it("should match orders and open position with leverage", async () => {
>>>>>>> development:test/positioning/Positioning.test.ts
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account1.address, ten.toString());
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account2.address, ten.toString());
>>>>>>> development:test/positioning/Positioning.test.ts

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2400")),
          Asset(volmexBaseToken.address, convert("24")),
          0,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("24")),
          Asset(virtualToken.address, convert("2400")),
          1,
          0,
          true,
        );

        const vaultAddress = await vaultController.getVault(virtualToken.address);

        const vaultContract = await vault.attach(vaultAddress);
        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        // let a = await indexPriceOracle
        // opening the position here
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeftLeverage, signatureLeft, orderRightLeverage, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");
>>>>>>> development:test/positioning/Positioning.test.ts

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
        await expect(positionSize.toString()).to.be.equal(convert("24"))
        await expect(positionSize1.toString()).to.be.equal(convert("-24"))
      })
=======
        await expect(positionSize).to.be.equal("24000000000000000000");
        await expect(positionSize1).to.be.equal("-24000000000000000000");
      });
>>>>>>> development:test/positioning/Positioning.test.ts

      it("should close whole position of both traders", async () => {
        for (let i = 0; i < 9; i++) {
          await matchingEngine.addObservation(10000000, 0);
        }

        // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account1.address, ten.toString());
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, virtualToken.address, account2.address, ten.toString());
>>>>>>> development:test/positioning/Positioning.test.ts

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("2400").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize).to.be.equal("24000000000000000000");
        await expect(positionSize1).to.be.equal("-24000000000000000000");

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        // reducing the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, virtualToken.address);

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
        await expect(positionSizeAfter).to.be.equal("0")
      })

      it.only("should liquidate left trader", async () => {
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

        const USDCVaultAddress = await vaultController.getVault(virtualToken.address)

        const USDCVaultContract = await vault.attach(USDCVaultAddress)

        await USDCVaultContract.setPositioning(positioning.address)

        await accountBalance1.grantSettleRealizedPnlRole(vaultController.address);

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
        
        let signatureLeft = await getSignature(orderLeft1, account1.address)
        let signatureRight = await getSignature(orderRight1, account2.address)

        console.log("\nBefore");
        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        console.log("Opening position 1");

        const [realized1, unrealized1] = await accountBalance1.getPnlAndPendingFee(owner.address);

        console.log("Liquidator balance: ", realized1.toString());
        console.log("Liquidator unrealized balance: ", unrealized1.toString());

        await positioning.openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator)

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
        await indexPriceOracle.addIndexDataPoint(0, 700 * 1e6);
        await indexPriceOracle.addIndexDataPoint(1, 700 * 1e6);

        console.log("\nAfter index price updated to 400");
        console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        // 0.5 > 0.125

        const orderLeftNew = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("50")),
          Asset(volmexBaseToken.address, convert("1")),
          3,
          0,
          false,
        )

        const orderRightNew = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("1")),
          Asset(virtualToken.address,  convert("50")),
          4,
          0,
          true,
        )
        
        let signatureLeft1 = await getSignature(orderLeftNew, account1.address)
        let signatureRight1 = await getSignature(orderRightNew, account2.address)

        console.log("Account 1 liquidatable: ", (await positioning.isAccountLiquidatable(account1.address)));
        console.log("Account 2 liquidatable: ", (await positioning.isAccountLiquidatable(account2.address)));

        await expect(positioning.openPosition(orderLeftNew, '0x', orderRightNew, signatureRight1, liquidator)).to.emit(
          positioning,
          "PositionLiquidated",
        );

        const positionSize2 = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        )
        const positionSize3 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        )

        console.log("Account 1 position: ", positionSize2.toString());
        console.log("Account 2 position: ", positionSize3.toString());

        console.log("\nAfter 2nd position open");

        await expect(positionSize2.toString()).to.be.equal(convert("3"));
        await expect(positionSize3.toString()).to.be.equal(convert("-3"));

        const [realized, unrealized] = await accountBalance1.getPnlAndPendingFee(owner.address);

        console.log("Liquidator balance: ", realized.toString());
        console.log("Liquidator unrealized balance: ", unrealized.toString());

        // console.log("Account 1 value: ", (await positioning.getAccountValue(account1.address)).toString());
        // console.log("Account 2 value: ", (await positioning.getAccountValue(account2.address)).toString());

        // console.log("Account 1 liquidatable: ", (await positioning.isAccountLiquidatable(account1.address)));
        // console.log("Account 2 liquidatable: ", (await positioning.isAccountLiquidatable(account2.address)));

        // console.log("\n\n\n");

        // Short order -> convert to long order without signature
        // Normal order -> match
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
=======
        await expect(positionSizeAfter).to.be.equal("0");
      });

      it("should match orders and open position", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        await vaultController.connect(account1).deposit(virtualToken.address, 25000);
        await vaultController.connect(account2).deposit(virtualToken.address, 25000);
>>>>>>> development:test/positioning/Positioning.test.ts

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("2")),
          0,
          0,
=======
          87654321987654,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
>>>>>>> development:test/positioning/Positioning.test.ts
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
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-20000000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("20000000000000000000000");
      });

      it("should reduce position of both traders", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        await vaultController.connect(account1).deposit(virtualToken.address, 25000);
        await vaultController.connect(account2).deposit(virtualToken.address, 25000);

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        );

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "2000"),
          Asset(baseToken.address, "2000"),
          1,
        );

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "2000"),
          Asset(virtualToken.address, "2000"),
          1,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-10000000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("10000000000000000000000");

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        // reducing the position here
        await expect(
          positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address);

        await expect(positionSizeAfter.toString()).to.be.equal("-8000000000000000000000");
      });

      it("should close the whole position", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        await vaultController.connect(account1).deposit(virtualToken.address, 25000);
        await vaultController.connect(account2).deposit(virtualToken.address, 25000);

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        );

        const orderLeft1 = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "10000"),
          Asset(baseToken.address, "10000"),
          1,
        );

        const orderRight1 = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          1,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getTakerPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getTakerPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-10000000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("10000000000000000000000");

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        // reducing the position here
        await expect(
          positioning.openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getTakerPositionSize(account1.address, baseToken.address);
        const positionSizeAfter1 = await accountBalance1.getTakerPositionSize(account2.address, baseToken.address);
        await expect(positionSizeAfter.toString()).to.be.equal("0");
        await expect(positionSizeAfter1.toString()).to.be.equal("0");
      });

      it("test for get all funding payment", async () => {
        const [owner, account1, account2] = await ethers.getSigners();
        markPriceFake.getCumulativePrice.returns(25);
        indexPriceFake.getIndexTwap.returns(20);

        expect(await positioning.getAllPendingFundingPayment(account1.address)).to.be.equal(0);
      });

      it("test for getters", async () => {
        expect(await positioning.getVaultController()).to.be.equal(vaultController.address);
        expect(await positioning.getPositioningConfig()).to.be.equal(positioningConfig.address);
        expect(await positioning.getAccountBalance()).to.be.equal(accountBalance1.address);
      });
      it("test for settle all funding", async () => {
        const [owner, account1, account2] = await ethers.getSigners();
        await positioning.settleAllFunding(account1.address);
      });
    });
    describe("failure", function () {
      it("failure for wrong basetoken given", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith(" V_PERP: Basetoken is not registered in market");
      });

      it("failure for opening with zero amount", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        const orderLeft = Order(
          account1.address,
          87654321987654,
          true,
          Asset(baseToken.address, "0"),
          Asset(virtualToken.address, "0"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "0"),
          Asset(baseToken.address, "0"),
          1,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("division by zero");
      });
      it("failure not enough free collateral", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        markPriceFake.getCumulativePrice.returns(10);
        await baseToken.getIndexPrice.returns(2);
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

        const orderLeft = Order(
          account1.address,
          87654321987654,
          false,
          Asset(virtualToken.address, "20000"),
          Asset(baseToken.address, "20000"),
          1,
        );

        const orderRight = Order(
          account2.address,
          87654321987654,
          true,
          Asset(baseToken.address, "20000"),
          Asset(virtualToken.address, "20000"),
          1,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("P_NEFCI");
        it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
          const [owner, account1, account2] = await ethers.getSigners();

>>>>>>> development:test/positioning/Positioning.test.ts
          const orderLeft = Order(
            account1.address,
            deadline,
            true,
            Asset(baseToken.address, "20"),
            Asset(virtualToken.address, "20"),
            1,
          );

          const orderRight = Order(
            account2.address,
            deadline,
            false,
            Asset(virtualToken.address, "20"),
            Asset(baseToken.address, "20"),
            1,
          );

          let signatureLeft = await getSignature(orderLeft, owner.address);
          let signatureRight = await getSignature(orderRight, account2.address);

          await expect(
            matchingEngine.matchOrdersTest(orderLeft, signatureLeft, orderRight, signatureRight),
          ).to.be.revertedWith("V_PERP_M: order signature verification error");
        });
      });
      it("should fail to match orders as deadline has expired", async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        const [owner, account1, account2] = await ethers.getSigners();

        const orderLeft = Order(
          ORDER,
          10,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          10,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: Order deadline validation failed");
      });
      it("should fail to match orders as maker is not transaction sender", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        const orderLeft = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          0,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          0,
          0,
          false,
        );
>>>>>>> development:test/positioning/Positioning.test.ts

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: maker is not tx sender");
      });
      it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        const [owner, account1, account2] = await ethers.getSigners();
>>>>>>> development:test/positioning/Positioning.test.ts

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
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

        let signatureLeft = await getSignature(orderLeft, owner.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: order signature verification error");
      });

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
        await matchingEngine.grantMatchOrders(positioning.address)
=======
        const [owner, account1, account2, account3] = await ethers.getSigners();
        await matchingEngine.grantMatchOrders(positioning.address);
>>>>>>> development:test/positioning/Positioning.test.ts

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
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
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account3.address);

        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: order verification failed");
      });

      it("should fail to match orders as order maker is contract but signature cannot be verified", async () => {
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
        erc1271Test = await ERC1271Test.deploy()

        await virtualToken.addWhitelist(account1.address)
        await virtualToken.addWhitelist(erc1271Test.address)
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)

        await matchingEngine.grantMatchOrders(positioning.address);
=======
        const [owner, account1, account2, account3] = await ethers.getSigners();

        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        erc1271Test = await ERC1271Test.deploy();
>>>>>>> development:test/positioning/Positioning.test.ts

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
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          erc1271Test.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.connect(account1).openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: contract order signature verification error");
      });
      it("should fail to match orders & revert as order is cancelled", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);
        await virtualToken.addWhitelist(account1.address);
        await virtualToken.addWhitelist(account2.address);
        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);
>>>>>>> development:test/positioning/Positioning.test.ts

        await positioning.connect(account1).setMakerMinSalt(100);

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20"),
          Asset(virtualToken.address, "20"),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20"),
          Asset(volmexBaseToken.address, "20"),
          1,
          0,
          false,
        );

<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
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
=======
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: Order canceled");
      });
      it("wrong market registry", async () => {
        const [owner, account1, account2, account3] = await ethers.getSigners();
        await expect(positioning.connect(owner).setMarketRegistry(account1.address)).to.be.revertedWith("V_VPMM");
      });
    });
  });
>>>>>>> development:test/positioning/Positioning.test.ts
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
<<<<<<< HEAD:test/matching-engine/Positioning.test.ts
  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
})
=======
});
>>>>>>> development:test/positioning/Positioning.test.ts
