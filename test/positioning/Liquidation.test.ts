import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { FundingRate, IndexPriceOracle, MarkPriceOracle } from "../../typechain";
import { BigNumber } from "ethers";

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
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let markPriceFake: FakeContract<MarkPriceOracle>;
  let indexPriceFake: FakeContract<IndexPriceOracle>;
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
  let orderLeft, orderRight, orderLeft1, orderRight1;
  const deadline = 87654321987654;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;

  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")); // 10e18
  const nine = ethers.constants.WeiPerEther.mul(BigNumber.from("4")); // 10e18

  const hundred = ethers.constants.WeiPerEther.mul(BigNumber.from("1000000")); // 100e18
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    volmexBaseToken1 = await upgrades.deployProxy(
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
        [volmexBaseToken.address, volmexBaseToken1.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

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
    await (await volmexBaseToken1.setMintBurnRole(positioning.address)).wait();
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
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken1.address);
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
    orderLeft1 = Order(
      ORDER,
      87654321987654,
      account1.address,
      Asset(volmexBaseToken1.address, BigNumber.from("100").mul(one).toString()),
      Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
      10,
      0,
      true,
    );

    orderRight1 = Order(
      ORDER,
      87654321987654,
      account2.address,
      Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
      Asset(volmexBaseToken1.address, BigNumber.from("100").mul(one).toString()),
      100,
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

      it("should liquidate trader when position size / total position size < 1 liquidable position size > 0  ", async () => {
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
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);
        const accountValue = await vaultController.getAccountValue(account1.address);
        const liquidatblePositionsize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          accountValue.toString(),
        );
        const ratio = parseInt(positionsize) / (parseInt(positionSizeAbs) * 2);

        expect(ratio).to.be.lessThan(1);

        expect(liquidatblePositionsize.toString()).to.not.equal("0");
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
      it("when user opens position with multiple base tokens then getLiquidablePositionSize > 0", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        await expect(
          positioning.openPosition(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

        await expect(
          positioning.openPosition(
            orderLeft1,
            signatureLeft1,
            orderRight1,
            signatureRight1,
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
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionSizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);
        const accountValue = await vaultController.getAccountValue(account1.address);
        const liquidatblePositionsize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          orderLeft.makeAsset.virtualToken,
          accountValue.toString(),
        );
        const ratio = parseInt(positionsize) / (parseInt(positionSizeAbs) * 2);
        expect(ratio).to.be.lessThan(1);
        expect(liquidatblePositionsize.toString()).to.not.equal("0");
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
        const positionsize = await accountBalance1.getTotalPositionValue(
          account1.address,
          orderLeft.makeAsset.virtualToken,
        );
        const positionsizeAbs = await accountBalance1.getTotalAbsPositionValue(account1.address);
        console.log(positionsize.toString(), "position size");
        console.log(positionsizeAbs.toString(), "position sizeabs ");
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
