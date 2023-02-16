import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { FundingRate, IndexPriceOracle, MarkPriceOracle } from "../../typechain";
import { BigNumber } from "ethers";
import { max } from "lodash";

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
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
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
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
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
    );
    await volmexBaseToken.deployed();

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [
        [1000, 1000],
        [volmexBaseToken.address, volmexBaseToken.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

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
    );
    await baseToken.deployed();

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

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await markPriceOracle.setMatchingEngine(matchingEngine.address);

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
      false,
    ]);

    vault2 = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance.address,
      virtualToken.address,
      accountBalance.address,
      false,
    ]);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
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
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
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

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(convert("1000000"));

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

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(10000000, 0)
    // }
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      markPriceOracle.address,
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
              [owner.address, account2.address],
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
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
              markPriceOracle.address,
              indexPriceOracle.address,
              0,
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
      await expect(
        positioning.connect(owner).setDefaultFeeReceiver(ethers.constants.AddressZero),
      ).to.be.revertedWith("PC_DFRZ");
    });
  });

  describe("toggleWhitelist", async () => {
    it("should fail to set whitelisted flag if caller doesn't have admin role", async () => {
      await expect(
        positioning.connect(account1).toggleWhitelist(),
      ).to.be.revertedWith("Positioning: Not admin");
    });

    it("should set whitelisted flag if caller has admin role", async () => {
      const tx = positioning.toggleWhitelist();
      expect(tx.confirmations).not.equal(0);
    });
  });

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should match orders and open position", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.volatilityCapRatioByIndex.whenCalledWith(3600).returns('1000000000000000');

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

      it("should match orders and open position with leverage", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal(convert("24"));
        await expect(positionSize1.toString()).to.be.equal(convert("-24"));
      });
      it("should use order validation before opening position ", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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

        await expect(positionSize.toString()).to.be.equal(convert("40"));
        await expect(positionSize1.toString()).to.be.equal(convert("-40"));
      });

      it("should match orders and open position with multiple orders funding rate should not be greator than 0.08", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("1000")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
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
          Asset(virtualToken.address, convert("1000")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
          Asset(volmexBaseToken.address, convert("10")),
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
        await expect(positionSize3.toString()).to.be.equal(convert("-20"));
        await expect(positionSize2.toString()).to.be.equal(convert("20"));
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
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("1000")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
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
          Asset(virtualToken.address, convert("1000")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
          Asset(volmexBaseToken.address, convert("10")),
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
        await expect(positionSize3.toString()).to.be.equal(convert("-20"));
        await expect(positionSize2.toString()).to.be.equal(convert("20"));
        const pendingFunding1 = parseInt(
          await positioning.getPendingFundingPayment(account1.address, volmexBaseToken.address),
        );
        const pendingFunding2 = parseInt(
          await positioning.getPendingFundingPayment(account2.address, volmexBaseToken.address),
        );
        await matchingEngine.addObservation(10000000, 0);
        await matchingEngine.addObservation(10500000, 0);
        await matchingEngine.addObservation(17082020, 0);
        expect(Math.abs(pendingFunding1 / parseInt(positionSize3))).to.be.lessThan(maxFundingRate);
        expect(Math.abs(pendingFunding2 / parseInt(positionSize2))).to.be.lessThan(maxFundingRate);
      });

      it("should match orders and open position with multiple orders", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
          Asset(volmexBaseToken.address, convert("10")),
          Asset(virtualToken.address, convert("1000")),
          1,
          0,
          true,
        );

        const orderRightLeverage = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
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
          Asset(virtualToken.address, convert("1000")),
          3,
          0,
          true,
        );

        const orderRightLeverage1 = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, convert("1000")),
          Asset(volmexBaseToken.address, convert("10")),
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
        await expect(positionSize3.toString()).to.be.equal(convert("-20"));
        await expect(positionSize2.toString()).to.be.equal(convert("20"));
      });

      it("should match orders and open position with 5x leverage", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
        for (let i = 0; i < 9; i++) {
          await matchingEngine.addObservation(10000000, 0);
        }

        // indexPriceOracle.getIndexTwap.whenCalledWith(0).returns(['1000000000000000', '0', '0']);
        // indexPriceOracle.getIndexTwap.whenCalledWith(3600).returns(['1000000000000000', '0', '0']);

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

      it("should close the whole position", async () => {
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
          Asset(virtualToken.address, convert("200")),
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
          Asset(virtualToken.address, convert("200")),
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

      it("test for get all funding payment", async () => {
        const [owner, account1, account2] = await ethers.getSigners();

        expect(await positioning.getAllPendingFundingPayment(account1.address)).to.be.equal(0);
      });

      it("test for getters", async () => {
        expect(await positioning.getVaultController()).to.be.equal(vaultController.address);
        expect(await positioning.getPositioningConfig()).to.be.equal(positioningConfig.address);
        expect(await positioning.getAccountBalance()).to.be.equal(accountBalance1.address);
        expect(await positioning.getTotalAbsPositionValue(account1.address)).to.equal(0);
        const positioningConfig1 = await accountBalance.getPositioningConfig();
        expect(positioningConfig1).to.equal(positioningConfig.address);
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

        await markPriceOracle.setMatchingEngine(account1.address);
        await markPriceOracle.connect(account1).addObservation(10000000000, 0);
        await markPriceOracle.connect(account1).addObservation(10000000000, 1);

        await positioning.settleAllFunding(account1.address);
      });

      it("test for liquidators", async () => {
        await expect(await positioning.isLiquidatorWhitelist(owner.address)).to.equal(true);

        await expect(await positioning.isLiquidatorWhitelist(account2.address)).to.equal(true);

        await expect(await positioning.isLiquidatorWhitelist(account1.address)).to.equal(false);
      });

      it("should whitelist a new liquidator", async () => {
        await expect(await positioning.whitelistLiquidator(owner.address, false))
          .to.emit(positioning, "LiquidatorWhitelisted")
          .withArgs(owner.address, false);

        await expect(await positioning.isLiquidatorWhitelist(owner.address)).to.equal(false);

        await expect(await positioning.whitelistLiquidator(account1.address, true))
          .to.emit(positioning, "LiquidatorWhitelisted")
          .withArgs(account1.address, true);

        await expect(await positioning.isLiquidatorWhitelist(account1.address)).to.equal(true);
      });

      it("should not be able to whitelist liquidator if not have appropriate role", async () => {
        await expect(
          positioning.connect(account1).whitelistLiquidator(owner.address, false),
        ).to.be.revertedWith("Positioning: Not admin");
      });
    });
    describe("failure", function () {
      it("should not use order validation before opening position", async () => {
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

        await matchingEngine.grantMatchOrders(positioning.address);

        await virtualToken.mint(account1.address, convert("1000"));
        

        await virtualToken.connect(account1).approve(vault.address, convert("1000"));
        await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"));
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            convert("1000"),
          );

        const orderLeftLeverage = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(virtualToken.address, convert("6000")),
          Asset(volmexBaseToken.address, convert("60")),
          1,
          0,
          false,
        );

        await expect(
          positioning.connect(account1).getOrderValidate(orderLeftLeverage),
        ).to.be.revertedWith("V_PERP_NEFC");
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
        ).to.be.revertedWith("V_PERP: Basetoken not registered at market");
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
        // const txn = await markPriceOracle.getCumulativePrice(10000000, 0);

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
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let perpViewFake;

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
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    const [owner, account4] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);

    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
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
    );
    await volmexBaseToken.deployed();

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [
        [1000, 1000],
        [volmexBaseToken.address, volmexBaseToken.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    baseToken = await smock.fake("VolmexBaseToken");

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

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await markPriceOracle.setMatchingEngine(matchingEngine.address);

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
      false,
    ]);

    transferManagerTest = await upgrades.deployProxy(
      TransferManagerTest,
      [erc20TransferProxy.address, owner.address],
      {
        initializer: "__TransferManager_init",
      },
    );

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
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
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
        [owner.address, account2.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      markPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
    await matchingEngine.grantMatchOrders(positioning.address);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
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
      Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
      Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
      1,
      0,
      true,
    );

    orderRight = Order(
      ORDER,
      87654321987654,
      account2.address,
      Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
      Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
      1,
      0,
      false,
    );

    // for (let i = 0; i < 9; i++) {
    //   await matchingEngine.addObservation(10000000, 0)
    // }
  });

  describe("Match orders:", function () {
    describe("Success:", function () {
      it("should liquidate trader", async () => {
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

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [200000000, 200000000],
              [proofHash, proofHash],
            )
          ).wait();
        }
        console.log("Testsssss", account2.address);
        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-10000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-90000000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("90000000000000000000");
      });

      it("should fail to liquidate if account is not whitelisted & successfully liquidate if onlyWhitelisted is set to false", async () => {
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

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [200000000, 200000000],
              [proofHash, proofHash],
            )
          ).wait();
        }
        console.log("Testsssss", account2.address);
        // liquidating the position
        await expect(
          positioning
            .connect(account1)
            .liquidate(account1.address, volmexBaseToken.address, "-10000000000000000000"),
        ).to.be.revertedWith("Positioning: liquidator not whitelisted");

        positioning.toggleWhitelist();

        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "-10000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");
      });

      it("should liquidate whole position", async () => {
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

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [200000000, 200000000],
              [proofHash, proofHash],
            )
          ).wait();
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

      it("should liquidate long position", async () => {
        await virtualToken.mint(account1.address, ten.toString());
        await virtualToken.mint(account2.address, ten.toString());

        await virtualToken.connect(account1).approve(vault.address, ten.add(ten).toString());
        await virtualToken.connect(account2).approve(vault.address, ten.add(ten).toString());

        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, ten.add(ten).toString());
        await virtualToken
          .connect(account2)
          .approve(volmexPerpPeriphery.address, ten.add(ten).toString());

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

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 6; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [250000000, 250000000],
              [proofHash, proofHash],
            )
          ).wait();
        }

        const orderLeft1 = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(virtualToken.address, BigNumber.from("25000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          1,
          0,
          false,
        );

        const orderRight1 = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("25000").mul(one).toString()),
          1,
          0,
          true,
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft1.takeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft1.takeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("-100000000000000000000");

        for (let index = 0; index < 6; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [100000, 100000],
              [proofHash, proofHash],
            )
          ).wait();
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

      it("should not liquidate when trader account value is enough", async () => {
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

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "10000000000000000000"),
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

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

        for (let index = 0; index < 10; index++) {
          await (
            await indexPriceOracle.updateBatchVolatilityTokenPrice(
              [0, 1],
              [200000000, 200000000],
              [proofHash, proofHash],
            )
          ).wait();
        }

        // liquidating the position
        await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken.address, "10000000000000000000"),
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

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          orderLeft.makeAsset.virtualToken,
        );

        await expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        await expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const liquidatablePosition = await positioning.getLiquidatablePosition(
          account1.address,
          volmexBaseToken.address,
        );
        expect(liquidatablePosition.toString()).to.equal("10000000000000000000");
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
