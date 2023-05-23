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
  let volmexBaseToken;
  let volmexBaseToken1;
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
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken1.address],
        [200000000, 200000000],
        [200060000, 200060000],
        [proofHash, proofHash],
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
    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken.address],
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

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

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
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
        [volmexBaseToken.address, volmexBaseToken1.address],
        [owner.address, account2.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
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
    await vaultController.registerVault(vault.address, virtualToken.address);
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
              [volmexBaseToken.address, volmexBaseToken.address],
              [owner.address, account2.address],
            ],
            {
              initializer: "initialize",
            },
          ),
        ).to.be.revertedWith("P_PCNC");
      });
      it("should fail to initialze account balance again", async () => {
        await expect(
          accountBalance.initialize(positioningConfig.address, [
            volmexBaseToken.address,
            volmexBaseToken.address,
          ]),
        ).to.be.revertedWith("Initializable: contract is already initialized");
      });
      it("should fail to initialze account balance again because invalid positionig config adderess", async () => {
        await expect(
          upgrades.deployProxy(AccountBalance, [
            account1.address,
            [volmexBaseToken.address, volmexBaseToken1.address],
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
            [volmexBaseToken.address, volmexBaseToken1.address],
            [owner.address, account2.address],
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
              [volmexBaseToken.address, volmexBaseToken1.address],
              [owner.address, account2.address],
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
              [volmexBaseToken.address, volmexBaseToken1.address],
              [owner.address, account2.address],
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
              [volmexBaseToken.address, volmexBaseToken1.address],
              [owner.address, account2.address],
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
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });

  describe("setUnderlying price index", async () => {
    it("should set index price oracle ", async () => {
      expect(
        await accountBalance.connect(owner).setUnderlyingPriceIndex(volmexBaseToken.address, 0),
      )
        .to.emit(accountBalance, "UnderlyingPriceIndexSet")
        .withArgs(1);
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

        await virtualToken.mint(account1.address, convert("10000"));
        await virtualToken.mint(account2.address, convert("10000"));

        await virtualToken.connect(account1).approve(vault.address, convert("10000"));
        await virtualToken.connect(account2).approve(vault.address, convert("10000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("10000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("10000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("10000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("10000"),
          );

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
      it("should fail to open position when contract is paused", async () => {
        // indexPriceOracle.getIndexSma.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexSma.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("10000"));
        await virtualToken.mint(account2.address, convert("10000"));

        await virtualToken.connect(account1).approve(vault.address, convert("10000"));
        await virtualToken.connect(account2).approve(vault.address, convert("10000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("10000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("10000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("10000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("10000"),
          );

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        // opening the position here
        await positioning.pause();
        await expect(
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("Pausable: paused");
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
      });

      it("should use order validation before opening position ", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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

        await virtualToken.mint(account1.address, convert("1000000000000"));
        await virtualToken.mint(account2.address, convert("1000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("10")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("10")),
          Asset(volmexBaseToken.address, convert("2")),
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

        await expect(positionSize.toString()).to.be.equal(convert("-2"));
        await expect(positionSize1.toString()).to.be.equal(convert("2"));

        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken.address, convert("1")),
          Asset(virtualToken.address, convert("10")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("10")),
          Asset(volmexBaseToken.address, convert("1")),
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
        await expect(positionSize3.toString()).to.be.equal(convert("-1"));
        await expect(positionSize2.toString()).to.be.equal(convert("1"));
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
        await virtualToken.mint(account1.address, convert("1000000000000"));
        await virtualToken.mint(account2.address, convert("1000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("10")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("10")),
          Asset(volmexBaseToken.address, convert("2")),
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

        await expect(positionSize.toString()).to.be.equal(convert("-2"));
        await expect(positionSize1.toString()).to.be.equal(convert("2"));
        await virtualToken.mint(account1.address, convert("1000000000000000"));
        await virtualToken.mint(account2.address, convert("1000000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000000000000000"),
          );
        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("2")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("2")),
          Asset(volmexBaseToken.address, convert("2")),
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
        await expect(positionSize3.toString()).to.be.equal(convert("-4"));
        await expect(positionSize2.toString()).to.be.equal(convert("4"));
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

        await virtualToken.mint(account1.address, convert("1000000000000000"));
        await virtualToken.mint(account2.address, convert("1000000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000000000000000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("1")),
          Asset(virtualToken.address, convert("10")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("10")),
          Asset(volmexBaseToken.address, convert("1")),
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

        await expect(positionSize.toString()).to.be.equal(convert("-1"));
        await expect(positionSize1.toString()).to.be.equal(convert("1"));

        const orderLeftLeverage1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("1")),
          Asset(virtualToken.address, convert("10")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("10")),
          Asset(volmexBaseToken.address, convert("1")),
          4,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeftLeverage1, account1.address);
        let signatureRight1 = await getSignature(orderRightLeverage1, account2.address);
        await virtualToken.mint(account1.address, convert("1000000000000000"));
        await virtualToken.mint(account2.address, convert("1000000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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
        await expect(positionSize3.toString()).to.be.equal(convert("-2"));
        await expect(positionSize2.toString()).to.be.equal(convert("2"));
      });

      it("should match orders and open position with 5x leverage", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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

        await virtualToken.mint(account1.address, convert("1000000000"));
        await virtualToken.mint(account2.address, convert("1000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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
        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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

        await virtualToken.mint(account1.address, convert("1000000000"));
        await virtualToken.mint(account2.address, convert("1000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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

        await virtualToken.mint(account1.address, convert("1000000000"));
        await virtualToken.mint(account2.address, convert("1000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("1000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
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

        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("100000000000000"),
          );

        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("20")),
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
          Asset(virtualToken.address, convert("20")),
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
        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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

        await expect(positionSize).to.be.equal(convert("2"));
        await expect(positionSize1).to.be.equal(convert("-2"));

        const orderRight1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("20")),
          Asset(volmexBaseToken.address, convert("2")),
          2,
          0,
          false,
        );

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
          Asset(virtualToken.address, convert("20")),
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

        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("90")),
          Asset(volmexBaseToken.address, convert("2")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("4")),
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
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft1.makeAsset.virtualToken,
        );

        expect(positionSizeAfter.toString()).to.be.equal("0");
      });
      it("should close position with complementary order scenario 2", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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
        ).to.emit(positioning, "PositionChanged");

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("4")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
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
            .openPosition(orderLeft1, signatureLeft1, orderRight1, signatureRight1, liquidator),
        ).to.emit(positioning, "PositionChanged");
        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft1.makeAsset.virtualToken,
        );

        expect(positionSizeAfter.toString()).to.be.equal("0");
      });
      it("should close position with complementary order scenario where order cannot be filled anymore", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("100000000000000"));
        await virtualToken.mint(account2.address, convert("100000000000000"));
        await virtualToken.mint(account3.address, convert("100000000000000"));

        await virtualToken.connect(account1).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account2).approve(vault.address, convert("100000000000000"));
        await virtualToken.connect(account3).approve(vault.address, convert("100000000000000"));

        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await virtualToken
          .connect(account3)
          .approve(volmexPerpPeriphery.address, convert("100000000000000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account3.address,
            convert("100000000000000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
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
        ).to.emit(positioning, "PositionChanged");

        const orderLeft1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("200")),
          Asset(volmexBaseToken.address, convert("2")),
          8,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, convert("2")),
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
        expect(await positioning.getVaultController()).to.be.equal(vaultController.address);
        expect(await positioning.getPositioningConfig()).to.be.equal(positioningConfig.address);
        expect(await positioning.getAccountBalance()).to.be.equal(accountBalance1.address);
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

        vault = await upgrades.deployProxy(Vault, [
          positioningConfig.address,
          accountBalance.address,
          virtualToken.address,
          accountBalance.address,
        ]);

        vault2 = await upgrades.deployProxy(Vault, [
          positioningConfig.address,
          accountBalance.address,
          virtualToken.address,
          accountBalance.address,
        ]);

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

        // vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address])

        positioning = await upgrades.deployProxy(
          Positioning,
          [
            positioningConfig.address,
            vaultController.address,
            accountBalance1.address,
            matchingEngine.address,
            perpetualOracle.address,
            [volmexBaseToken.address, volmexBaseToken.address],
            [owner.address, account2.address],
          ],
          {
            initializer: "initialize",
          },
        );
        await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
        await (await virtualToken.setMintBurnRole(positioning.address)).wait();
        marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

        // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
        await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
        // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
        await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
        await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
        await matchingEngine.grantMatchOrders(positioning.address);
        await vault.connect(owner).setPositioning(positioning.address);
        await vault.connect(owner).setVaultController(vaultController.address);
        await vaultController.registerVault(vault.address, virtualToken.address);
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

        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            ten.toString(),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            ten.toString(),
          );

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

        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            ten.toString(),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            ten.toString(),
          );
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
          Asset(volmexBaseToken1.address, convert("2")),
          1,
          0,
          false,
        );

        const orderRight2 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(volmexBaseToken1.address, convert("2")),
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

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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
        await expect(
          positioning.connect(account1).getOrderValidate(orderLeftLeverage),
        ).to.be.revertedWith("V_PERP_NF");
      });

      it("failure for wrong basetoken given", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));

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
        await virtualToken.mint(account1.address, 1000000000000000);
        await virtualToken.mint(account2.address, 1000000000000000);

        await virtualToken.connect(account1).approve(vault.address, 1000000000000000);
        await virtualToken.connect(account2).approve(vault.address, 1000000000000000);

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
        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));

        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

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

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

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
          positioning
            .connect(account1)
            .openPosition(orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
        ).to.be.revertedWith("V_PERP_M: order verification failed");
      });

      it("should fail to match orders as order maker is contract but signature cannot be verified", async () => {
        erc1271Test = await ERC1271Test.deploy();

        await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000);
        await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.approveTest(erc1271Test.address, vault.address, convert("1000"));
        await virtualToken.approveTest(
          erc1271Test.address,
          volmexPerpPeriphery.address,
          convert("1000"),
        );

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(erc1271Test.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            erc1271Test.address,
            convert("1000"),
          );

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

        await virtualToken.mint(account1.address, convert("1000"));
        await virtualToken.mint(account2.address, convert("1000"));

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account2).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, convert("1000"));

        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account2.address,
            convert("1000"),
          );

        await (await matchingEngine.connect(account1).cancelAllOrders(100)).wait();

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

describe("Liquidation test in Positioning", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
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
  let PerpetualOracle;
  let perpetualOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let volmexBaseToken1;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let Perppetual;
  let transferManagerTest;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let orderLeft, orderRight, orderLeft1, orderRight1;
  const deadline = 87654321987654;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("9")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("100")); // 10e18
  const nine = ethers.constants.WeiPerEther.mul(BigNumber.from("4")); // 10e18

  const hundred = ethers.constants.WeiPerEther.mul(BigNumber.from("1000000000000")); // 100e18
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const capRatio = "400000000";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    // indexPriceOracle = await smock.fake("IndexPriceOracle")
    // indexPriceFake = await smock.fake("IndexPriceOracle")
    // markPriceFake = await smock.fake("IndexPriceOracle")

    // fundingRate = await smock.fake("FundingRate")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
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
    const [owner, account4] = await ethers.getSigners();
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
    await volmexBaseToken.deployed();

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
    await volmexBaseToken1.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken1.address],
        [60000000, 58000000],
        [50060000, 45060000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);

    await perpetualOracle.setIndexObservationAdder(owner.address);
    for (let i = 0; i < 10; i++) {
      await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
      await time.increase(300);
    }

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await positioningConfig.deployed();

    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

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

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
    ]);

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
    ]);
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        [volmexBaseToken.address, volmexBaseToken1.address],
        [owner.address, account2.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexBaseToken1.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);

    await perpetualOracle.setIndexObservationAdder(owner.address);
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken1.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig.setTwapIntervalLiquidation(3600);
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(hundred.toString());

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await virtualToken.mint(account1.address, ten.toString());
    await virtualToken.mint(account2.address, ten.toString());

    await virtualToken.connect(account1).approve(vault.address, ten.toString());
    await virtualToken.connect(account2).approve(vault.address, ten.toString());
    await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
    await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

    // volmexPerpPeriphery.address, USDC.address, alice.address, amount
    await vaultController
      .connect(account1)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account1.address,
        ten.toString(),
      );
    await vaultController
      .connect(account2)
      .deposit(
        volmexPerpPeriphery.address,
        virtualToken.address,
        account2.address,
        ten.toString(),
      );

    orderLeft = Order(
      ORDER,
      87654321987654,
      account1.address,
      Asset(volmexBaseToken.address, BigNumber.from("1").mul(two).toString()),
      Asset(virtualToken.address, BigNumber.from("100").mul(two).toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      87654321987654,
      account2.address,
      Asset(virtualToken.address, BigNumber.from("100").mul(two).toString()),
      Asset(volmexBaseToken.address, BigNumber.from("1").mul(two).toString()),
      1,
      0,
      false,
    );
    orderLeft1 = Order(
      ORDER,
      87654321987654,
      account1.address,
      Asset(volmexBaseToken1.address, BigNumber.from("1").mul(one).toString()),
      Asset(virtualToken.address, BigNumber.from("100").mul(one).toString()),
      10,
      0,
      true,
    );

    orderRight1 = Order(
      ORDER,
      87654321987654,
      account2.address,
      Asset(virtualToken.address, BigNumber.from("100").mul(one).toString()),
      Asset(volmexBaseToken1.address, BigNumber.from("1").mul(one).toString()),
      100,
      0,
      false,
    );
    await (await perpetualOracle.setPositioning(positioning.address)).wait();
    await (await perpetualOracle.grantSmaIntervalRole(positioningConfig.address)).wait();
    await positioningConfig.setTwapInterval(28800);
    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(1000000, 0);
    // }
  });

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should liquidate trader", async () => {
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [70000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [70000000], [proofHash])).wait();
        }
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        const accountValue = await vaultController.getAccountValue(account1.address);

        const liquidatbalePositionSize = await accountBalance.getLiquidatablePositionSize(
          account1.address,
          volmexBaseToken.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [70000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [70000000], [proofHash])).wait();
        }
        await time.increase(60000);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-1000000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1000000000000000000");
      });
      it("should return zero liquidatable position size for different base token", async () => {
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");
        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }
        const accountValue = await vaultController.getAccountValue(account1.address);

        const liquidatbalePositionSize = await accountBalance.getLiquidatablePositionSize(
          account1.address,
          volmexBaseToken.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }

        const liquidatbalePositionSize1 = await accountBalance.getLiquidatablePositionSize(
          account1.address,
          volmexBaseToken1.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
      });
      it("should liquidate trader when liquidator white list is disabled", async () => {
        await positioning.toggleLiquidatorWhitelist();
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");
        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-1000000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1000000000000000000");
      });
      it("should not liquidate when contract is paused", async () => {
        await positioning.toggleLiquidatorWhitelist();
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");
        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        // liquidating the position
        await positioning.pause();
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.be.revertedWith("Pausable: paused");
      });
      it("should not liquidate when liquidator is not white listed", async () => {
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");
        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        // liquidating the position
        await expect(
          positioning
            .connect(account1)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.be.revertedWith("P_LW");
      });
      it("should liquidate trader when position size / total position size < 1 liquidatable position size > 0  ", async () => {
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          28800,
        );
        const positionSizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);
        const accountValue = await vaultController.getAccountValue(account1.address);
        const liquidatablePositionsize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          accountValue.toString(),
        );
        const ratio = parseInt(positionsize) / (parseInt(positionSizeAbs) * 2);

        expect(ratio).to.be.lessThan(1);

        expect(liquidatablePositionsize.toString()).to.not.equal("0");
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-1000000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1000000000000000000");
      });
      it("when user opens position with multiple base tokens then getLiquidatablePositionSize > 0", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          28800,
        );
        const positionSizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);
        const accountValue = await vaultController.getAccountValue(account1.address);
        const liquidatablePositionsize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          accountValue.toString(),
        );
        const ratio = parseInt(positionsize) / (parseInt(positionSizeAbs) * 2);
        expect(ratio).to.be.lessThan(1);
        expect(liquidatablePositionsize.toString()).to.not.equal("0");
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-1000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-1000000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1000000000000000000");
      });

      it("should liquidate whole position", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidateFullPosition(account1.address, volmexBaseToken.address),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("0");
        await expect(positionSizeLiquidator.toString()).to.be.equal("0");
      });
      it("should not when contract is paused liquidate whole position", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }
        await positioning.pause();
        // not liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidateFullPosition(account1.address, volmexBaseToken.address),
        ).to.be.revertedWith("Pausable: paused");
      });
      it("should not liquidate when trader account value is enough", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.toString());
        await virtualToken.connect(account2).approve(vault.address, ten.toString());
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            ten.toString(),
          );

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");
        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account2.address, volmexBaseToken.address, "1000000000000000000"),
        ).to.be.revertedWith("P_EAV");
      });
      it("should not liquidate in wrong direction", async () => {
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
        ).to.emit(positioning, "PositionChanged");
        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        await time.increase(14400);
        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }

        await time.increase(28800);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [250000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [250000000], [proofHash])).wait();
        }

        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "1000000000000000000"),
        ).to.be.revertedWith("P_WLD");
      });

      it("should get liquidatable position of a trader", async () => {
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
        ).to.emit(positioning, "PositionChanged");
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          28800,
        );
        const positionsizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        const liquidatablePosition = await positioning.getLiquidatablePosition(
          account1.address,
          volmexBaseToken.address,
        );
        expect(liquidatablePosition.toString()).to.equal("200000000000000000");
      });

      it("should fail to get liquidatable position of a trader if position size is 0", async () => {
        await expect(
          positioning.getLiquidatablePosition(account1.address, volmexBaseToken.address),
        ).to.be.revertedWith("P_PSZ");
      });
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
