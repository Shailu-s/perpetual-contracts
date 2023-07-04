import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("Positioning", function () {
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
  let vault, vault2;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let accountBalance;
  let PerpetualOracle;
  let perpetualOracle;
  let VolmexBaseToken;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let volmexBaseToken;
  let volmexBaseToken1;
  let volmexBaseToken2;
  let volmexBaseToken3;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;

  let transferManagerTest;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let orderLeft, orderRight;
  const deadline = 87654321987654;
  const maxFundingRate = 0.08;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;

  const one = ethers.constants.WeiPerEther; // 1e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")); // 10e18
  const ORDER = "0xf555eb98";
  const TAKE_PROFIT_INDEX_PRICE = "0x67393efa";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
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
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");

    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    liquidator = encodeAddress(owner.address);

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    volmexBaseToken1 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();
    volmexBaseToken2 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken2.deployed();
    volmexBaseToken3 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken3.deployed();
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          volmexBaseToken.address,
          volmexBaseToken1.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
        ],
        [200000000, 200000000, 30750000000, 1862000000],
        [200060000, 200060000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);
    baseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "BaseToken", // nameArg
        "BTN", // symbolArg,
        perpetualOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await baseToken.deployed();

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit",
    });
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await positioningConfig.deployed();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, perpetualOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );
    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        volmexBaseToken.address,
        volmexBaseToken1.address,
        volmexBaseToken2.address,
        volmexBaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 18);
    await USDC.deployed();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        volmexBaseToken.address,
        volmexBaseToken1.address,
        volmexBaseToken2.address,
        volmexBaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [
        volmexBaseToken.address,
        volmexBaseToken1.address,
        volmexBaseToken2.address,
        volmexBaseToken3.address,
      ],
    ]);
    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);

    // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        marketRegistry.address,
        [
          volmexBaseToken.address,
          volmexBaseToken1.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, account2.address],
        ["10000000000000000000", "10000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.grantAddBaseTokenRole(owner.address);
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance1.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap(convert("100000000000000000000000000"));
    await positioning.setPositioning(positioning.address);
    await positioning.setPositioning(accountBalance1.address);
    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    orderLeft = Order(
      ORDER,
      deadline,
      account1.address,
      Asset(virtualToken.address, convert("2400")),
      Asset(volmexBaseToken.address, convert("24")),
      1,
      0,
      false,
    );

    orderRight = Order(
      ORDER,
      deadline,
      account2.address,
      Asset(volmexBaseToken.address, convert("24")),
      Asset(virtualToken.address, convert("2400")),
      2,
      0,
      true,
    );
    await (await perpetualOracle.setPositioning(positioning.address)).wait();
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(10000000, 0);
    // }
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault2.address],
      owner.address,
      relayer.address,
    ]);
    deadline;
  });

  describe("Deployment", function () {
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
              perpetualOracle.address,
              marketRegistry.address,
              [
                volmexBaseToken.address,
                volmexBaseToken1.address,
                volmexBaseToken2.address,
                volmexBaseToken3.address,
              ],
              [chainlinkTokenIndex1, chainlinkTokenIndex2],
              [owner.address, account2.address],
              ["1000000000000000000", "1000000000000000000"],
            ],
            {
              initializer: "initialize",
            },
          ),
        ).to.be.revertedWith("P_PCNC");
      });

      it("wrong market registry", async () => {
        const [owner, account1, account2] = await ethers.getSigners();
        await expect(
          upgrades.deployProxy(
            Positioning,
            [
              positioningConfig.address,
              vaultController.address,
              accountBalance1.address,
              matchingEngine.address,
              perpetualOracle.address,
              account1.address,
              [
                volmexBaseToken.address,
                volmexBaseToken1.address,
                volmexBaseToken2.address,
                volmexBaseToken3.address,
              ],
              [chainlinkTokenIndex1, chainlinkTokenIndex2],
              [owner.address, account2.address],
              ["1000000000000000000", "1000000000000000000"],
            ],
            {
              initializer: "initialize",
            },
          ),
        ).to.be.revertedWith("P_MENC");
      });
      it("should fail to initialze account balance again", async () => {
        await expect(
          accountBalance.initialize(
            positioningConfig.address,
            [
              volmexBaseToken.address,
              volmexBaseToken1.address,
              volmexBaseToken2.address,
              volmexBaseToken3.address,
            ],
            [chainlinkTokenIndex1, chainlinkTokenIndex2],
            matchingEngine.address,
            owner.address,
          ),
        ).to.be.revertedWith("Initializable: contract is already initialized");
      });

      it("should fail to initialze account balance again because invalid positionig config adderess", async () => {
        await expect(
          upgrades.deployProxy(AccountBalance, [
            account1.address,
            [
              volmexBaseToken.address,
              volmexBaseToken1.address,
              volmexBaseToken2.address,
              volmexBaseToken3.address,
            ],
            [chainlinkTokenIndex1, chainlinkTokenIndex2],
            matchingEngine.address,
            owner.address,
          ]),
        ).to.be.revertedWith("AB_VPMMCNC");
      });
      it("should fail to intialize again", async () => {
        const [owner, account1, account2] = await ethers.getSigners();
        await expect(
          positioning.initialize(
            account1.address,
            vaultController.address,
            accountBalance1.address,
            matchingEngine.address,
            perpetualOracle.address,
            marketRegistry.address,
            [
              volmexBaseToken.address,
              volmexBaseToken1.address,
              volmexBaseToken2.address,
              volmexBaseToken3.address,
            ],
            [chainlinkTokenIndex1, chainlinkTokenIndex2],
            [owner.address, account2.address],
            ["1000000000000000000", "1000000000000000000"],
          ),
        ).to.be.revertedWith("Initializable: contract is already initialized");
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
              perpetualOracle.address,
              marketRegistry.address,
              [
                volmexBaseToken.address,
                volmexBaseToken1.address,
                volmexBaseToken2.address,
                volmexBaseToken3.address,
              ],
              [chainlinkTokenIndex1, chainlinkTokenIndex2],
              [owner.address, account2.address],
              ["1000000000000000000", "1000000000000000000"],
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
              perpetualOracle.address,
              marketRegistry.address,
              [
                volmexBaseToken.address,
                volmexBaseToken1.address,
                volmexBaseToken2.address,
                volmexBaseToken3.address,
              ],
              [chainlinkTokenIndex1, chainlinkTokenIndex2],
              [owner.address, account2.address],
              ["1000000000000000000", "1000000000000000000"],
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
              perpetualOracle.address,
              marketRegistry.address,
              [
                volmexBaseToken.address,
                volmexBaseToken1.address,
                volmexBaseToken2.address,
                volmexBaseToken3.address,
              ],
              [chainlinkTokenIndex1, chainlinkTokenIndex2],
              [owner.address, account2.address],
              ["1000000000000000000", "1000000000000000000"],
            ],
            {
              initializer: "initialize",
            },
          ),
        ).to.be.revertedWith("P_MENC");
      });
    });
  });

  describe("setDefaultFeeReceiver", async () => {
    it("should fail to set default fee receiver as zero address", async () => {
      await expect(positioning.connect(owner).setDefaultFeeReceiver(ZERO_ADDR)).to.be.revertedWith(
        "PC_DFRZ",
      );
    });

    it("should fail to set default fee receiver as caaler is not owner", async () => {
      await expect(
        positioning.connect(account1).setDefaultFeeReceiver(account1.address),
      ).to.be.revertedWith("P_NA");
    });
  });

  describe("setters", async () => {
    it("should set index price oracle ", async () => {
      expect(
        await accountBalance.connect(owner).setUnderlyingPriceIndex(volmexBaseToken.address, 0),
      )
        .to.emit(accountBalance, "UnderlyingPriceIndexSet")
        .withArgs(1);
    });
    it("should set min time bound in account balance", async () => {
      await accountBalance.setMinTimeBound(1000);
      const minTimeBound = await accountBalance.minTimeBound();
      expect(minTimeBound.toString()).to.be.equal("1000");
    });
    it("should fail to set min time bound in account balance", async () => {
      await expect(accountBalance.connect(account1).setMinTimeBound(1000)).to.be.revertedWith(
        "AccountBalance: Not sigma IV role",
      );
    });
    it("should fail to set min time bound less than five min in account balance", async () => {
      await expect(accountBalance.setMinTimeBound(10)).to.be.revertedWith("AB_NS5");
    });
    it("should fail to update underlying index", async () => {
      await expect(
        positioning.setUnderlyingPriceIndex(
          volmexBaseToken2.address,
          "57896044618658097711785492504343953926634992332820282019728792003956564819971",
        ),
      ).to.be.revertedWith("Positioning: Not add underlying index role");
    });
    it("should fail to set sigma viv ", async () => {
      await expect(
        accountBalance
          .connect(account1)
          .setSigmaViv(
            "57896044618658097711785492504343953926634992332820282019728792003956564819971",
            "7400",
          ),
      ).to.be.revertedWith("AccountBalance: Not sigma IV role");
    });
    it("should set sigma viv ", async () => {
      await accountBalance.setSigmaViv(
        "57896044618658097711785492504343953926634992332820282019728792003956564819971",
        "7400",
      );
      const sigmaViv = await accountBalance.sigmaVolmexIvs(
        "57896044618658097711785492504343953926634992332820282019728792003956564819971",
      );
      expect(sigmaViv.toString()).to.be.equal("7400");
    });
    it("should set index price allowed interval", async () => {
      await positioning.setIndexOracleInterval(5000);
      const interval = await positioning.indexPriceAllowedInterval();
      expect(interval.toString()).to.be.equal("5000");
    });
    it("should set perp oracle", async () => {
      await positioning.setPerpetualOracle(perpetualOracle.address);
    });
    it("should fail to set perp oracle", async () => {
      await expect(positioning.setPerpetualOracle(ZERO_ADDR)).to.be.revertedWith("P_AZ");
    });
    it("should fail to set index price oracle ", async () => {
      await expect(
        accountBalance.connect(account1).setUnderlyingPriceIndex(volmexBaseToken.address, 0),
      ).to.be.revertedWith("AccountBalance: Not admin");
    });
  });
  describe("set twInterval for liquidation", async () => {
    it("should set tw interwal for liquidation", async () => {
      await positioningConfig.setTwapIntervalLiquidation(5000);
      const twIntervalliquidation = await positioningConfig.getTwapIntervalLiquidation();
      expect(twIntervalliquidation.toString()).to.be.equal("5000");
    });
    it("should fail to set tw interwal for liquidation", async () => {
      await expect(
        positioningConfig.connect(account1).setTwapIntervalLiquidation(5000),
      ).to.revertedWith("PositioningConfig: Not admin");
    });
  });
  describe("set positioning for account balance", async () => {
    it("should set positiong but fail to add invalid base token", async () => {
      await accountBalance.setPositioning(owner.address);
      await expect(
        accountBalance.registerBaseToken(owner.address, virtualToken.address),
      ).to.be.revertedWith("AccountBalance: not base token");
    });
  });
  describe("set funding period", async () => {
    it("should set index price oracle ", async () => {
      expect(await positioning.connect(owner).setFundingPeriod("500"))
        .to.emit(positioning, "FundingPeriodSet")
        .withArgs("500");
    });
    it("should fail to set  index price oracle ", async () => {
      await expect(positioning.connect(account1).setFundingPeriod(28800)).to.be.revertedWith(
        "P_NA",
      );
    });
  });
  describe("toggleLiquidatorWhitelist", async () => {
    it("should fail to set whitelisted flag if caller doesn't have admin role", async () => {
      await expect(positioning.connect(account1).toggleLiquidatorWhitelist()).to.be.revertedWith(
        "P_NA",
      );
    });

    it("should set whitelisted flag if caller has admin role", async () => {
      const tx = positioning.toggleLiquidatorWhitelist();
      expect(tx.confirmations).not.equal(0);
    });
  });

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should match orders and open position", async () => {
        // indexPriceOracle.getIndexSma.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexSma.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("10000"));
        await USDC.mint(account2.address, convert("10000"));

        await USDC.connect(account1).approve(vault.address, convert("10000"));
        await USDC.connect(account2).approve(vault.address, convert("10000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("10000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("10000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("10000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("10000"));

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize).to.be.equal(convert("24"));
        await expect(positionSize1).to.be.equal(convert("-24"));
      });
      it("should fail when oracle is stale", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("10000"));
        await USDC.mint(account2.address, convert("10000"));

        await USDC.connect(account1).approve(vault.address, convert("10000"));
        await USDC.connect(account2).approve(vault.address, convert("10000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("10000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("10000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("10000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("10000"));

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await time.increase(3600);
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("P_SIP");
      });
      it("should fail to open position when contract is paused", async () => {
        // indexPriceOracle.getIndexSma.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexSma.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("10000"));
        await USDC.mint(account2.address, convert("10000"));

        await USDC.connect(account1).approve(vault.address, convert("10000"));
        await USDC.connect(account2).approve(vault.address, convert("10000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("10000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("10000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("10000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("10000"));

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await positioning.pause();
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("Pausable: paused");

        await positioning.unpause();
        await positioning
          .connect(account1)
          .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator);
      });
      it("should fail to validate orders", async () => {
        let orderLeftLeverage = Order(
          ORDER,
          deadline,
          ZERO_ADDR,
          Asset(virtualToken.address, convert("2000")),
          Asset(volmexBaseToken.address, convert("20")),
          2,
          0,
          false,
        );
        await expect(positioning.getOrderValidate(orderLeftLeverage)).to.be.revertedWith(
          "V_PERP_OVF",
        );
        let orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2000")),
          Asset(volmexBaseToken.address, convert("20")),
          0,
          0,
          false,
        );
        await expect(positioning.getOrderValidate(orderLeftLeverage1)).to.be.revertedWith(
          "V_PERP_0S",
        );
        const orderLeftLeverage2 = Order(
          ORDER,
          deadline,
          ZERO_ADDR,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("1")),
          2,
          0,
          false,
        );
        await expect(positioning.getOrderValidate(orderLeftLeverage2)).to.be.revertedWith(
          "V_PERP: TBMPS",
        );
      });

      it("should use order validation before opening position ", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("4000")),
          Asset(volmexBaseToken.address, convert("40")),
          1,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("40")),
          Asset(virtualToken.address, convert("4000")),
          1,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        await positioning.connect(account1).getOrderValidate(orderLeftLeverage);
        await positioning.connect(account2).getOrderValidate(orderRightLeverage);

        // let a = await indexPriceOracle
        // opening the position here
        await perpetualOracle.setIndexObservationAdder(owner.address);
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
          await perpetualOracle.addIndexObservations([1], [100000000], [proofHash]);
        }
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        // get 0 position size for base token 2
        const positionSize2 = await accountBalance1.getTotalPositionValue(
          account2.address,
          volmexBaseToken1.address,
          3600,
        );

        const pnltoBerealized = await positioning.getPnlToBeRealized({
          trader: account1.address,
          baseToken: volmexBaseToken.address,
          base: "10000",
          quote: "10000000",
        });
        expect(pnltoBerealized.toString()).to.be.equal("0");
        await expect(positionSize.toString()).to.be.equal(convert("40"));
        await expect(positionSize1.toString()).to.be.equal(convert("-40"));
      });

      it("should match orders and open position with multiple orders funding rate should not be greator than 0.08", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000000000000"));
        await USDC.mint(account2.address, convert("1000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("100")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal(convert("-20"));
        await expect(positionSize1.toString()).to.be.equal(convert("20"));

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("100")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("10")),
          4,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeftLeverage1, account2.address);
        let signatureRight1 = await getSignature(orderRightLeverage1, account1.address);

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage1,
              signatureLeft1,
              orderRightLeverage1,
              signatureRight1,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize3 = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize2 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        await expect(positionSize3.toString()).to.be.equal(convert("-10"));
        await expect(positionSize2.toString()).to.be.equal(convert("10"));
        const pendingFunding1 = parseInt(
          await positioning.getPendingFundingPayment(account1.address, volmexBaseToken.address),
        );
        const pendingFunding2 = parseInt(
          await positioning.getPendingFundingPayment(account2.address, volmexBaseToken.address),
        );
        expect(Math.abs(pendingFunding1 / parseInt(positionSize3))).to.be.lessThan(maxFundingRate);
        expect(Math.abs(pendingFunding2 / parseInt(positionSize2))).to.be.lessThan(maxFundingRate);
      });
      it("should match orders and open position with multiple orders funding rate should not be greator than 0.08 with chnage in prices", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);
        await USDC.mint(account1.address, convert("1000000000000"));
        await USDC.mint(account2.address, convert("1000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("100")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal(convert("-20"));
        await expect(positionSize1.toString()).to.be.equal(convert("20"));
        await USDC.mint(account1.address, convert("1000000000000000"));
        await USDC.mint(account2.address, convert("1000000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000000000"),
          );
        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("20")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("20")),
          Asset(volmexBaseToken.address, convert("20")),
          4,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeftLeverage1, account1.address);
        let signatureRight1 = await getSignature(orderRightLeverage1, account2.address);

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage1,
              signatureLeft1,
              orderRightLeverage1,
              signatureRight1,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize3 = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize2 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        await expect(positionSize3.toString()).to.be.equal(convert("-40"));
        await expect(positionSize2.toString()).to.be.equal(convert("40"));
        const pendingFunding1 = parseInt(
          await positioning.getPendingFundingPayment(account1.address, volmexBaseToken.address),
        );
        const pendingFunding2 = parseInt(
          await positioning.getPendingFundingPayment(account2.address, volmexBaseToken.address),
        );
        await matchingEngine.addObservation(0, 10500000);
        await matchingEngine.addObservation(0, 10500000);
        await matchingEngine.addObservation(0, 17082020);
        expect(Math.abs(pendingFunding1 / parseInt(positionSize3))).to.be.lessThan(maxFundingRate);
        expect(Math.abs(pendingFunding2 / parseInt(positionSize2))).to.be.lessThan(maxFundingRate);
      });

      it("should match orders and open position with multiple orders", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000000000000000"));
        await USDC.mint(account2.address, convert("1000000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("100")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("10")),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal(convert("-10"));
        await expect(positionSize1.toString()).to.be.equal(convert("10"));

        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("100")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("10")),
          4,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeftLeverage1, account1.address);
        let signatureRight1 = await getSignature(orderRightLeverage1, account2.address);
        await USDC.mint(account1.address, convert("1000000000000000"));
        await USDC.mint(account2.address, convert("1000000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("1000000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000000000"),
          );

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage1,
              signatureLeft1,
              orderRightLeverage1,
              signatureRight1,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize3 = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize2 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        await expect(positionSize3.toString()).to.be.equal(convert("-20"));
        await expect(positionSize2.toString()).to.be.equal(convert("20"));
      });

      it("should match orders and open position with 5x leverage", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("4900")),
          Asset(volmexBaseToken.address, convert("49")),
          0,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("49")),
          Asset(virtualToken.address, convert("4900")),
          1,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);
        await perpetualOracle.setIndexObservationAdder(owner.address);

        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
        }

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal(convert("49"));
        await expect(positionSize1.toString()).to.be.equal(convert("-49"));
      });

      it("should close whole position of both traders", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000000000"));
        await USDC.mint(account2.address, convert("1000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000"),
          );

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("240").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("240").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
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
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          virtualToken.address,
        );

        await expect(positionSizeAfter).to.be.equal("0");
      });
      it("should close position for market order with limit order", async () => {
        await perpetualOracle.setIndexObservationAdder(owner.address);
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000000000"));
        await USDC.mint(account2.address, convert("1000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("1000000000"),
          );
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
        }
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "1900000000000000000000"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "1900000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          1,
          0,
          false,
        );
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "1900000000000000000000"),
          78,
          0,
          true,
        );

        const orderRight1 = Order(
          TAKE_PROFIT_INDEX_PRICE,
          deadline,
          account1.address,
          Asset(virtualToken.address, "1999000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          89,
          199000000,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account2.address);
        let signatureRight1 = await getSignature(orderRight1, account1.address);
        // closing the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        );
        expect(positionSizeAfter1.toString()).to.be.equal("0");
      });
      it("should not be allowed to close position", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000000000"));
        await USDC.mint(account2.address, convert("1000000000"));

        await USDC.connect(account1).approve(vault.address, convert("1000000000"));
        await USDC.connect(account2).approve(vault.address, convert("1000000000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("240").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("240").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("24").mul(one).toString()),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await perpetualOracle.setIndexObservationAdder(owner.address);
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
        }

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        await perpetualOracle.setIndexObservationAdder(owner.address);
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [400000000], [proofHash]);
        }
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [400000000], [proofHash]);
        }
        await expect(positionSize).to.be.equal("24000000000000000000");
        await expect(positionSize1).to.be.equal("-24000000000000000000");

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        // reducing the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.be.revertedWith("CH_NEMRM");
      });

      it("should close the whole position", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("200")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");
        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );
        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize).to.be.equal(convert("20"));
        await expect(positionSize1).to.be.equal(convert("-20"));

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("20")),
          2,
          0,
          false,
        );

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("200")),
          3,
          0,
          true,
        );

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        // reducing the position here
        await expect(
          positioning.openPosition(
            orderLeft1,
            signatureLeft1,
            orderRight1,
            signatureRight1,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        );
        const positionSizeAfter1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        );
        await expect(positionSizeAfter.toString()).to.be.equal("0");
        await expect(positionSizeAfter1.toString()).to.be.equal("0");
      });
      it("should close position with complementary order scenario 1 ", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("90")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
        ).to.emit(positioning, "PositionChanged");
        console.log("here");
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("90")),
          Asset(volmexBaseToken.address, convert("20")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("40")),
          Asset(virtualToken.address, convert("70")),
          9,
          0,
          true,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account2.address);
        let signatureRight1 = await getSignature(orderRight1, account1.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight1, signatureRight1, orderLeft1, signatureLeft1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        expect(positionSizeAfter.toString()).to.be.equal("0");
      });
      it("should close position with complementary order scenario 2", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("50")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("40")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("90")),
          9,
          0,
          true,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account2.address);
        let signatureRight1 = await getSignature(orderRight1, account1.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight1, signatureRight1, orderLeft1, signatureLeft1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        expect(positionSizeAfter.toString()).to.be.equal("0");
      });
      it("should close position with complementary order scenario where order cannot be filled anymore", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));
        await USDC.mint(account3.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account3).approve(vault.address, convert("100000000000000"));

        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account3).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("20")),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("50")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("20")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("200")),
          9,
          0,
          true,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account2.address);
        let signatureRight1 = await getSignature(orderRight1, account1.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );
        expect(positionSizeAfter.toString()).to.be.equal("0");
        const orderRight2 = Order(
          ORDER,
          deadline,
          account3.address,
          Asset(volmexBaseToken.address, convert("4")),
          Asset(virtualToken.address, convert("400")),
          9,
          0,
          true,
        );
        let signatureRight2 = await getSignature(orderRight2, account3.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight2, signatureRight2, liquidator),
        ).to.be.revertedWith("V_PERP_M: nothing to fill");
      });
      it("test for get all funding payment", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        expect(await positioning.getAllPendingFundingPayment(account1.address)).to.be.equal(0);
      });

      it("test for getters", async () => {
        expect(await positioning.getTotalAbsPositionValue(account1.address)).to.equal(0);
        expect(
          await accountBalance.getLiquidatablePositionSize(
            account1.address,
            volmexBaseToken.address,
            0,
          ),
        ).to.equal(0);
        const positioningConfig1 = await accountBalance.getPositioningConfig();
        expect(positioningConfig1).to.equal(positioningConfig.address);
      });
      it("should fail when position size is less than min position size", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("100000000000000"));
        await USDC.mint(account2.address, convert("100000000000000"));
        await USDC.mint(account3.address, convert("100000000000000"));

        await USDC.connect(account1).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account2).approve(vault.address, convert("100000000000000"));
        await USDC.connect(account3).approve(vault.address, convert("100000000000000"));

        await USDC.connect(account1).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account2).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await USDC.connect(account3).approve(
          volmexPerpPeriphery.address,
          convert("100000000000000"),
        );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("100")),
          Asset(volmexBaseToken.address, convert("2")),
          1,
          0,
          false,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("50")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderRight, signatureRight, orderLeft, signatureLeft, liquidator),
        ).to.be.revertedWith("V_PERP: TBMPS");
      });
      it("should fail with re entrancy gaurd", async () => {
        matchingEngine = await upgrades.deployProxy(
          MatchingEngine,
          [owner.address, perpetualOracle.address],
          {
            initializer: "__MatchingEngineTest_init",
          },
        );

        await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

        virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
          initializer: "initialize",
        });
        await virtualToken.deployed();
        await virtualToken.setMintBurnRole(owner.address);

        transferManagerTest = await upgrades.deployProxy(
          TransferManagerTest,
          [erc20TransferProxy.address, owner.address],
          {
            initializer: "__TransferManager_init",
          },
        );
        const AccountBalance = await ethers.getContractFactory("AccountBalanceMock");
        const accountBalance1 = await upgrades.deployProxy(AccountBalance, [
          positioningConfig.address,
        ]);
        vaultController = await upgrades.deployProxy(VaultController, [
          positioningConfig.address,
          accountBalance1.address,
        ]);
        vault = await upgrades.deployProxy(Vault, [
          positioningConfig.address,
          accountBalance.address,
          USDC.address,
          vaultController.address,
        ]);

        vault2 = await upgrades.deployProxy(Vault, [
          positioningConfig.address,
          accountBalance.address,
          USDC.address,
          vaultController.address,
        ]);
        // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])
        marketRegistry = await upgrades.deployProxy(MarketRegistry, [
          virtualToken.address,
          [
            volmexBaseToken.address,
            volmexBaseToken1.address,
            volmexBaseToken2.address,
            volmexBaseToken3.address,
          ],
        ]);

        positioning = await upgrades.deployProxy(
          Positioning,
          [
            positioningConfig.address,
            vaultController.address,
            accountBalance1.address,
            matchingEngine.address,
            perpetualOracle.address,
            marketRegistry.address,
            [
              volmexBaseToken.address,
              volmexBaseToken1.address,
              volmexBaseToken2.address,
              volmexBaseToken3.address,
            ],
            [chainlinkTokenIndex1, chainlinkTokenIndex2],
            [owner.address, account2.address],
            ["1000000000000000000", "1000000000000000000"],
          ],
          {
            initializer: "initialize",
          },
        );
        await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
        await (await virtualToken.setMintBurnRole(positioning.address)).wait();

        // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
        await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
        await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
        await matchingEngine.grantMatchOrders(positioning.address);
        await vault.connect(owner).setPositioning(positioning.address);
        await vault.connect(owner).setVaultController(vaultController.address);
        await vaultController.registerVault(vault.address, USDC.address);
        await vaultController.connect(owner).setPositioning(positioning.address);

        await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
        await positioningConfig
          .connect(owner)
          .setSettlementTokenBalanceCap(convert("100000000000000000000000000"));

        await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
        await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
        await positioning.connect(owner).setPositioning(positioning.address);

        await matchingEngine.grantMatchOrders(positioning.address);

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2000")),
          Asset(volmexBaseToken.address, convert("20")),
          2,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("20")),
          Asset(virtualToken.address, convert("2000")),
          1,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.be.revertedWith("ReentrancyGuard: reentrant call");
      });
      it("test for settle all funding", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, ten.toString());
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, ten.toString());

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");

        await perpetualOracle.setMarkObservationAdder(account1.address);

        await positioning.settleAllFunding(account1.address);
      });
      it("should fail to settle owed realized pnl", async () => {
        await expect(
          accountBalance.connect(account1).settleOwedRealizedPnl(owner.address),
        ).to.be.revertedWith("AccountBalance: Not role settle PNL");
      });
      it("should fail to register base token", async () => {
        const volmexBaseToken1 = await upgrades.deployProxy(
          VolmexBaseToken,
          [
            "VolmexBaseToken", // nameArg
            "VBT", // symbolArg,
            account1.address, // priceFeedArg
            true, // isBase
          ],
          {
            initializer: "initialize",
          },
        );
        await volmexBaseToken1.deployed();
        await marketRegistry.addBaseToken(volmexBaseToken1.address);
        await positioningConfig.setMaxMarketsPerAccount(1);
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, ten.toString());
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, ten.toString());
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        );
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("20")),
          Asset(volmexBaseToken1.address, convert("20")),
          1,
          0,
          false,
        );

        const orderRight2 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken1.address, convert("20")),
          Asset(virtualToken.address, convert("20")),
          2,
          0,
          true,
        );

        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight2, account2.address);

        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft1, orderRight2, signatureRight1, liquidator),
        ).to.be.revertedWith("AB_MNE");
      });
      it("test for liquidators", async () => {
        await expect(await positioning.isLiquidatorWhitelisted(owner.address)).to.equal(true);

        await expect(await positioning.isLiquidatorWhitelisted(account2.address)).to.equal(true);

        await expect(await positioning.isLiquidatorWhitelisted(account1.address)).to.equal(false);
      });

      it("should whitelist a new liquidator", async () => {
        await expect(await positioning.whitelistLiquidator(owner.address, false))
          .to.emit(positioning, "LiquidatorWhitelisted")
          .withArgs(owner.address, false);

        await expect(await positioning.isLiquidatorWhitelisted(owner.address)).to.equal(false);

        await expect(await positioning.whitelistLiquidator(account1.address, true))
          .to.emit(positioning, "LiquidatorWhitelisted")
          .withArgs(account1.address, true);

        await expect(await positioning.isLiquidatorWhitelisted(account1.address)).to.equal(true);
      });

      it("should not be able to whitelist liquidator if not have appropriate role", async () => {
        await expect(
          positioning.connect(account1).whitelistLiquidator(owner.address, false),
        ).to.be.revertedWith("P_NA");
      });
    });
    describe("failure", function () {
      it("should not use validate order after opening position ", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("4000")),
          Asset(volmexBaseToken.address, convert("40")),
          1,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("40")),
          Asset(virtualToken.address, convert("4000")),
          1,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        await positioning.connect(account1).getOrderValidate(orderLeftLeverage);
        await positioning.connect(account2).getOrderValidate(orderRightLeverage);
        await perpetualOracle.setIndexObservationAdder(owner.address);
        for (let i = 0; i < 10; i++) {
          await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
        }
        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderRightLeverage,
              signatureRight,
              orderLeftLeverage,
              signatureLeft,
              liquidator,
            ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );
        await expect(
          positioning.connect(account2).getOrderValidate(orderRightLeverage),
        ).to.be.revertedWith("V_PERP_NF");
      });

      it("failure for wrong basetoken given", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));

        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("2400")),
          Asset(baseToken.address, convert("24")),
          1,
          0,
          false,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(baseToken.address, convert("24")),
          Asset(virtualToken.address, convert("2400")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("V_PBRM");
      });

      it("failure for opening with zero amount", async () => {
        await USDC.mint(account1.address, 1000000000000000);
        await USDC.mint(account2.address, 1000000000000000);

        await USDC.connect(account1).approve(vault.address, 1000000000000000);
        await USDC.connect(account2).approve(vault.address, 1000000000000000);

        orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("0")),
          Asset(volmexBaseToken.address, convert("0")),
          1,
          0,
          false,
        );

        orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("0")),
          Asset(virtualToken.address, convert("0")),
          2,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("division by zero");
      });

      it("failure not enough free collateral", async () => {
        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("P_NEFCI");
      });

      it("should not open position with more that 5x leverage", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("6000")),
          Asset(volmexBaseToken.address, convert("60")),
          0,
          0,
          false,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("60")),
          Asset(virtualToken.address, convert("6000")),
          1,
          0,
          true,
        );

        let signatureLeft = await getSignature(orderLeftLeverage, account1.address);
        let signatureRight = await getSignature(orderRightLeverage, account2.address);

        // let a = await indexPriceOracle
        // opening the position here
        await expect(
          positioning
            .connect(account1)
            .openPosition(
              orderLeftLeverage,
              signatureLeft,
              orderRightLeverage,
              signatureRight,
              liquidator,
            ),
        ).to.be.revertedWith("P_NEFCI");
      });

      it("should fail to match orders as maker is not transaction sender", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        let signatureLeft = await getSignature(orderLeft, owner.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        const order1 = { ...orderLeft };
        order1.salt = 0;

        await expect(
          positioning.openPosition(order1, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: maker is not tx sender");
      });
      it("should fail to match orders as signer is not order maker & order maker is not a contract", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20000000000000000000"),
          Asset(virtualToken.address, "20000000000000000000"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20000000000000000000"),
          Asset(volmexBaseToken.address, "20000000000000000000"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, owner.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("V_PERP_M: order signature verification error");
      });

      it("should fail to match orders as leftOrder taker is not equal to rightOrder maker", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20000000000000000000"),
          Asset(virtualToken.address, "20000000000000000000"),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, "20000000000000000000"),
          Asset(volmexBaseToken.address, "20000000000000000000"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account3.address);

        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: order verification failed");
      });

      it("should fail to match orders as order maker is contract but signature cannot be verified", async () => {
        erc1271Test = await ERC1271Test.deploy();

        await USDC.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await USDC.connect(account2).approve(matchingEngine.address, 1000000000000000);

        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.approveTest(erc1271Test.address, vault.address, convert("1000"));
        await USDC.approveTest(erc1271Test.address, volmexPerpPeriphery.address, convert("1000"));

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(erc1271Test.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            erc1271Test.address,
            convert("1000"),
          );

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20000000000000000000"),
          Asset(virtualToken.address, "20000000000000000000"),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          erc1271Test.address,
          Asset(virtualToken.address, "20000000000000000000"),
          Asset(volmexBaseToken.address, "20000000000000000000"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft1, account1.address);
        let signatureRight = await getSignature(orderRight1, account2.address);

        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft1, signatureLeft, orderRight1, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: contract order signature verification error");
      });
      it("should fail to match orders & revert as order is cancelled", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await USDC.mint(account1.address, convert("1000"));
        await USDC.mint(account2.address, convert("1000"));

        await USDC.connect(account1).approve(vault.address, convert("1000"));
        await USDC.connect(account2).approve(vault.address, convert("1000"));
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, convert("1000"));
        await vaultController
          .connect(account2)
          .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, convert("1000"));

        await (await matchingEngine.connect(account1).cancelAllOrders(100)).wait();

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "20000000000000000000"),
          Asset(virtualToken.address, "20000000000000000000"),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "20000000000000000000"),
          Asset(volmexBaseToken.address, "20000000000000000000"),
          1,
          0,
          false,
        );

        let signatureLeft = await getSignature(orderLeft1, account1.address);
        let signatureRight = await getSignature(orderRight1, account2.address);

        await expect(
          positioning.openPosition(
            orderLeft1,
            signatureLeft,
            orderRight1,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("V_PERP_M: Order canceled");
      });
      it("wrong market registry", async () => {
        await expect(
          positioning.connect(owner).setMarketRegistry(account1.address),
        ).to.be.revertedWith("V_VPMM");
      });
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
});
