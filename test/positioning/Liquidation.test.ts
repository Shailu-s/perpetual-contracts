import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");
describe.only("Liquidation test in Positioning", function () {
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
  const fivehundred = ethers.constants.WeiPerEther.mul(BigNumber.from("5000")); // 5e18
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
    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
      matchingEngine.address,
      owner.address,
    ]);
    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      virtualToken.address,
      accountBalance1.address,
    ]);

    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [volmexBaseToken.address, volmexBaseToken1.address],
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
        [volmexBaseToken.address, volmexBaseToken1.address],
        [owner.address, account2.address],
        ["1000000000000000000", "1000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexBaseToken1.setMintBurnRole(positioning.address)).wait();
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();

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

        const liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
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

        const liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
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

        const liquidatbalePositionSize1 = await accountBalance1.getLiquidatablePositionSize(
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
      it("should not fail when liquidation triggered again after min time to liquidate ", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await virtualToken.mint(account1.address, fivehundred.toString());
        await virtualToken.mint(account3.address, fivehundred.toString());
        await virtualToken.mint(account4.address, fivehundred.toString());
        await virtualToken.connect(account1).approve(vault.address, fivehundred.toString());
        await virtualToken.connect(account4).approve(vault.address, fivehundred.toString());
        await virtualToken.connect(account3).approve(vault.address, fivehundred.toString());
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await virtualToken
          .connect(account3)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await virtualToken
          .connect(account4)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            fivehundred.toString(),
          );
        const orderLeft = Order(
          ORDER,
          87654321987654,
          account3.address,
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          87654321987654,
          account4.address,
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          1,
          0,
          false,
        );
        let signatureLeft = await getSignature(orderLeft, account3.address);
        let signatureRight = await getSignature(orderRight, account4.address);

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
          account3.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account4.address,
          orderLeft.makeAsset.virtualToken,
        );

        expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const accountValue = await vaultController.getAccountValue(account4.address);

        const liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [70000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [70000000], [proofHash])).wait();
        }
        await time.increase(30000);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [25000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [25000000], [proofHash])).wait();
        }
        const accountValueafter = await vaultController.getAccountValue(account4.address);
        console.log(accountValueafter.toString(), " account value after");
        console.log(
          (await vaultController.getFreeCollateralByRatio(account4.address, "200000")).toString(),
          "free collateral by ratio",
        );
        // liquidating the position
        const liquidatbalePositionSize1 = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValueafter.toString(),
        );
        console.log(liquidatbalePositionSize1.toString(), " position size liquidatable after");
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");
        console.log("done first liquidation");
        await time.increase(1000);
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");
      });
      it("should fail to liquidate again", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await virtualToken.mint(account1.address, fivehundred.toString());
        await virtualToken.mint(account3.address, fivehundred.toString());
        await virtualToken.mint(account4.address, fivehundred.toString());
        await virtualToken.connect(account1).approve(vault.address, fivehundred.toString());
        await virtualToken.connect(account4).approve(vault.address, fivehundred.toString());
        await virtualToken.connect(account3).approve(vault.address, fivehundred.toString());
        await virtualToken
          .connect(account1)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await virtualToken
          .connect(account3)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await virtualToken
          .connect(account4)
          .approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            virtualToken.address,
            account1.address,
            fivehundred.toString(),
          );
        const orderLeft = Order(
          ORDER,
          87654321987654,
          account3.address,
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          87654321987654,
          account4.address,
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("100").mul(one).toString()),
          1,
          0,
          false,
        );
        let signatureLeft = await getSignature(orderLeft, account3.address);
        let signatureRight = await getSignature(orderRight, account4.address);

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
          account3.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account4.address,
          orderLeft.makeAsset.virtualToken,
        );

        expect(positionSize.toString()).to.be.equal("-100000000000000000000");
        expect(positionSize1.toString()).to.be.equal("100000000000000000000");

        const accountValue = await vaultController.getAccountValue(account4.address);

        const liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [70000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [70000000], [proofHash])).wait();
        }
        await time.increase(30000);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [25000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [25000000], [proofHash])).wait();
        }
        const accountValueafter = await vaultController.getAccountValue(account4.address);
        console.log(accountValueafter.toString(), " account value after");
        console.log(
          (await vaultController.getFreeCollateralByRatio(account4.address, "200000")).toString(),
          "free collateral by ratio",
        );
        // liquidating the position
        const liquidatbalePositionSize1 = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValueafter.toString(),
        );
        console.log(liquidatbalePositionSize1.toString(), " position size liquidatable after");
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        // liquidating again before before next liquidation
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.be.revertedWith("AB_ELT");
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
