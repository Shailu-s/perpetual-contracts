import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");
describe("Liquidation test", function () {
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
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let VolmexBaseToken;
  let volmexBaseToken;
  let volmexBaseToken1;
  let volmexBaseToken2;
  let volmexBaseToken3;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let Perppetual;
  let transferManagerTest;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let FundingRate;
  let fundingRate;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let orderLeft, orderRight, orderLeft1, orderRight1;
  const deadline = 87654321987654;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const fivehundred = ethers.constants.WeiPerEther.mul(BigNumber.from("5000")); // 5e18
  const twoThousand = ethers.constants.WeiPerEther.mul(BigNumber.from("5000"));
  const oneThousand = ethers.constants.WeiPerEther.mul(BigNumber.from("1000"));
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
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    FundingRate = await ethers.getContractFactory("FundingRate");
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
        [70000000, 60000000, 1800000000, 30650000000],
        [75000000, 50000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken2.setPriceFeed(perpetualOracle.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    for (let i = 0; i < 10; i++) {
      await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
      await time.increase(300);
    }

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await positioningConfig.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 18);
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
    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      virtualToken.address,
      [
        volmexBaseToken.address,
        volmexBaseToken1.address,
        volmexBaseToken2.address,
        volmexBaseToken3.address,
      ],
      [0, 1, chainlinkTokenIndex1, chainlinkTokenIndex2],
    ]);
    fundingRate = await upgrades.deployProxy(
      FundingRate,
      [perpetualOracle.address, positioningConfig.address, accountBalance1.address, owner.address],
      {
        initializer: "FundingRate_init",
      },
    );
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        fundingRate.address,
        marketRegistry.address,
        [
          volmexBaseToken.address,
          volmexBaseToken1.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, account1.address],
        ["10000000000000000", "10000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexBaseToken1.setMintBurnRole(positioning.address)).wait();
    await (await volmexBaseToken2.setMintBurnRole(positioning.address)).wait();
    await perpetualOracle.grantCacheChainlinkPriceRole(owner.address);
    await perpetualOracle.grantCacheChainlinkPriceRole(positioning.address);
    await (await virtualToken.setMintBurnRole(positioning.address)).wait();
    await positioning.whitelistLiquidator(account1.address, true);
    await positioning.whitelistLiquidator(account2.address, true);
    perpViewFake = await smock.fake("VolmexPerpView");
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
    await vaultController.setPeriphery(volmexPerpPeriphery.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    // await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    // await marketRegistry.connect(owner).addBaseToken(volmexBaseToken1.address);
    await marketRegistry.grantAddBaseTokenRole(owner.address);
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
    await positioningConfig.setTwapIntervalLiquidation(3600);
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(hundred.toString());

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);

    await USDC.mint(account1.address, ten.toString());
    await USDC.mint(account2.address, ten.toString());

    await USDC.connect(account1).approve(vault.address, ten.toString());
    await USDC.connect(account2).approve(vault.address, ten.toString());
    await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
    await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

    // volmexPerpPeriphery.address, USDC.address, alice.address, amount
    await vaultController
      .connect(account1)
      .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, ten.toString());
    await vaultController
      .connect(account2)
      .deposit(volmexPerpPeriphery.address, USDC.address, account2.address, ten.toString());

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
    await (await perpetualOracle.setFundingRate(fundingRate.address)).wait();
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
            .liquidate(account1.address, volmexBaseToken.address, "-100000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken.address,
        );

        await expect(positionSizeAfter.toString()).to.be.equal("-1990000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1990000000000000000");
      });
      it("should liquidate trader with chain link base tokens", async () => {
        await positioning.setMinPositionSize("1000000000000000000", volmexBaseToken2.address);
        let currentTimestamp = await time.latest();
        await chainlinkAggregator1.updateRoundData(
          "162863638383902",
          "180000000000",
          currentTimestamp.toString(),
          currentTimestamp.toString(),
        );
        await perpetualOracle.cacheChainlinkPrice(
          "57896044618658097711785492504343953926634992332820282019728792003956564819969",
        );
        await USDC.mint(account1.address, oneThousand.toString());
        await USDC.mint(account2.address, twoThousand.toString());

        await USDC.connect(account1).approve(vault.address, oneThousand.toString());
        await USDC.connect(account2).approve(vault.address, twoThousand.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, twoThousand.toString());

        // volmexPerpPeriphery.address, USDC.address, alice.address, amount
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            oneThousand.toString(),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            twoThousand.toString(),
          );

        orderLeft = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken2.address, BigNumber.from("1").mul(two).toString()),
          Asset(virtualToken.address, BigNumber.from("1800").mul(two).toString()),
          1,
          0,
          true,
        );

        orderRight = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("1800").mul(two).toString()),
          Asset(volmexBaseToken2.address, BigNumber.from("1").mul(two).toString()),
          1,
          0,
          false,
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
        ).to.emit(positioning, "PositionChanged");

        const positionSize = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken2.address,
        );
        const positionSize1 = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken2.address,
        );

        expect(positionSize.toString()).to.be.equal("-2000000000000000000");
        expect(positionSize1.toString()).to.be.equal("2000000000000000000");

        let accountValue = await vaultController.getAccountValue(account1.address);

        let liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          volmexBaseToken2.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        currentTimestamp = await time.latest();
        await chainlinkAggregator1.updateRoundData(
          "162863638383904",
          "180000000000",
          currentTimestamp.toString(),
          currentTimestamp.toString(),
        );
        await perpetualOracle.cacheChainlinkPrice(
          "57896044618658097711785492504343953926634992332820282019728792003956564819969",
        );

        await time.increase(30000);
        currentTimestamp = await time.latest();
        await chainlinkAggregator1.updateRoundData(
          "162863638383905",
          "400000000000",
          currentTimestamp.toString(),
          currentTimestamp.toString(),
        );
        await perpetualOracle.cacheChainlinkPrice(
          "57896044618658097711785492504343953926634992332820282019728792003956564819969",
        );
        await USDC.mint(account2.address, twoThousand.toString());
        await USDC.connect(account2).approve(vault.address, twoThousand.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, twoThousand.toString());

        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            twoThousand.toString(),
          );

        // liquidating the position
        accountValue = await vaultController.getAccountValue(account1.address);
        liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
          account1.address,
          volmexBaseToken2.address,
          accountValue.toString(),
        );
        const liquidated = await expect(
          positioning
            .connect(account2)
            .liquidate(account1.address, volmexBaseToken2.address, "-10000000000000000"),
        ).to.emit(positioning, "PositionLiquidated");

        const positionSizeAfter = await accountBalance1.getPositionSize(
          account1.address,
          volmexBaseToken2.address,
        );

        const positionSizeLiquidator = await accountBalance1.getPositionSize(
          account2.address,
          volmexBaseToken2.address,
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
        expect(liquidatbalePositionSize.toString()).to.be.equal("-2000000000000000000");
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
        expect(liquidatbalePositionSize1.toString()).to.be.equal("0");
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

        await expect(positionSizeAfter.toString()).to.be.equal("-1990000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1990000000000000000");
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
            .connect(account3)
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

        await expect(positionSizeAfter.toString()).to.be.equal("-1990000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1990000000000000000");
      });

      it("when user opens position with multiple base tokens then getLiquidatablePositionSize > 0", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);
        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

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

        await expect(positionSizeAfter.toString()).to.be.equal("-1990000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1990000000000000000");
      });

      it("should liquidate whole position", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

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
        await time.increase(3600);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [150000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [150000000], [proofHash])).wait();
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

        await expect(positionSizeAfter.toString()).to.be.equal("-1990000000000000000");
        await expect(positionSizeLiquidator.toString()).to.be.equal("1990000000000000000");
      });
      it("should not when contract is paused liquidate whole position", async () => {
        let signatureLeft = await getSignature(orderLeft, account1.address);
        let signatureRight = await getSignature(orderRight, account2.address);
        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());

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
        await USDC.mint(account1.address, ten.toString());
        await USDC.mint(account2.address, ten.toString());

        await USDC.connect(account1).approve(vault.address, ten.toString());
        await USDC.connect(account2).approve(vault.address, ten.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, ten.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, ten.toString());
        await vaultController
          .connect(account1)
          .deposit(volmexPerpPeriphery.address, USDC.address, account1.address, ten.toString());

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

      it("should not liquidate again if index price increases", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account1.address, fivehundred.toString());
        await USDC.mint(account3.address, fivehundred.toString());
        await USDC.mint(account4.address, fivehundred.toString());
        await USDC.connect(account1).approve(vault.address, fivehundred.toString());
        await USDC.connect(account4).approve(vault.address, fivehundred.toString());
        await USDC.connect(account3).approve(vault.address, fivehundred.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
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
          await (await perpetualOracle.addIndexObservations([0], [15000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [15000000], [proofHash])).wait();
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
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [200000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [200000000], [proofHash])).wait();
        }
        // liquidating again before before next liquidation
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.be.revertedWith("P_EAV");
      });
      it("should fail to liquidate again if liquidation triggered bofore time to liquidate", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account1.address, fivehundred.toString());
        await USDC.mint(account3.address, fivehundred.toString());
        await USDC.mint(account4.address, fivehundred.toString());
        await USDC.connect(account1).approve(vault.address, fivehundred.toString());
        await USDC.connect(account4).approve(vault.address, fivehundred.toString());
        await USDC.connect(account3).approve(vault.address, fivehundred.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
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
          await (await perpetualOracle.addIndexObservations([0], [15000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [15000000], [proofHash])).wait();
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
        const liquidation = await positioning
          .connect(account1)
          .liquidate(
            account4.address,
            volmexBaseToken.address,
            liquidatbalePositionSize1.toString(),
          );
        // liquidating again before before next liquidation
        const nextTimeForLiquidation = parseInt(
          await accountBalance1.nextLiquidationTime(account4.address),
        );
        const currentTimeStamp = parseInt(await time.latest());
        console.log("liquidation triggered before next time for liquidation");
        expect(currentTimeStamp).to.be.lessThan(nextTimeForLiquidation);
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.be.revertedWith("P_EAV");
      });
      it("should liquidate ideal amount to liquidate", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account2.address, fivehundred.toString());

        await USDC.mint(account1.address, fivehundred.toString());
        await USDC.mint(account3.address, fivehundred.toString());
        await USDC.mint(account4.address, fivehundred.toString());
        await USDC.connect(account2).approve(vault.address, fivehundred.toString());
        await USDC.connect(account1).approve(vault.address, fivehundred.toString());
        await USDC.connect(account4).approve(vault.address, fivehundred.toString());
        await USDC.connect(account3).approve(vault.address, fivehundred.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
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
        const orderLeft1 = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(volmexBaseToken.address, BigNumber.from("500").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(virtualToken.address, BigNumber.from("10000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("500").mul(one).toString()),
          1,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account1.address);
        let signatureRight1 = await getSignature(orderRight1, account2.address);

        await expect(
          positioning.openPosition(
            orderLeft1,
            signatureLeft1,
            orderRight1,
            signatureRight1,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

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
        const liquidation = await positioning
          .connect(account1)
          .liquidate(
            account4.address,
            volmexBaseToken.address,
            liquidatbalePositionSize1.toString(),
          );
        const { events } = await liquidation.wait();

        let data;
        events.forEach((log: any) => {
          if (log["event"] == "PositionLiquidated") {
            data = log["data"];
          }
        });
        const logData = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data,
        );
        const liquidatedPositionSize = logData[1];
        expect(liquidatedPositionSize.toString()).to.be.equal(
          liquidatbalePositionSize1.toString(),
        );
      });
      it("account should be liquidatable if index price drops continuosly and less amount is liquidated at each time", async () => {
        await time.increase(3600);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [60000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [60000000], [proofHash])).wait();
        }
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account1.address, oneThousand.toString());
        await USDC.mint(account3.address, oneThousand.toString());
        await USDC.mint(account4.address, oneThousand.toString());
        await USDC.connect(account1).approve(vault.address, oneThousand.toString());
        await USDC.connect(account4).approve(vault.address, oneThousand.toString());
        await USDC.connect(account3).approve(vault.address, oneThousand.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            oneThousand.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            oneThousand.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            oneThousand.toString(),
          );
        const orderLeft = Order(
          ORDER,
          87654321987654,
          account3.address,
          Asset(volmexBaseToken.address, BigNumber.from("33").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("1980").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          87654321987654,
          account4.address,
          Asset(virtualToken.address, BigNumber.from("1980").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("33").mul(one).toString()),
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

        expect(positionSize.toString()).to.be.equal("-33000000000000000000");
        expect(positionSize1.toString()).to.be.equal("33000000000000000000");

        const accountValue = await vaultController.getAccountValue(account4.address);

        const liquidatbalePositionSize = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValue.toString(),
        );
        expect(liquidatbalePositionSize.toString()).to.be.equal("0");
        await time.increase(3600);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [20000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [20000000], [proofHash])).wait();
        }

        const accountValueafterPirceDrop = await vaultController.getAccountValue(account4.address);
        const liquidatbalePositionSize1 = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValueafterPirceDrop.toString(),
        );
        const liquidation1 = await positioning
          .connect(account1)
          .liquidate(
            account4.address,
            volmexBaseToken.address,
            liquidatbalePositionSize1.toString(),
          );
        const { events } = await liquidation1.wait();
        let data;
        events.forEach((log: any) => {
          if (log["event"] == "PositionLiquidated") {
            data = log["data"];
          }
        });
        const logData = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data,
        );
        const liquidatedPositionSize = parseInt(logData[1]);
        expect(liquidatedPositionSize.toString()).to.be.equal("10000000000000000");
        await time.increase(3600);
        for (let index = 0; index < 10; index++) {
          await (await perpetualOracle.addIndexObservations([0], [11000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [11000000], [proofHash])).wait();
        }
        const accountValueafter1 = await vaultController.getAccountValue(account4.address);
        const liquidatbalePositionSize2 = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValueafter1.toString(),
        );

        const liquidation2 = await positioning
          .connect(account1)
          .liquidate(
            account4.address,
            volmexBaseToken.address,
            liquidatbalePositionSize2.toString(),
          );
        const tx = await liquidation2.wait();
        const events2 = tx.events;
        let data2;
        events2.forEach((log: any) => {
          if (log["event"] == "PositionLiquidated") {
            data2 = log["data"];
          }
        });
        const logData1 = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data2,
        );
        const liquidatedPositionSize1 = parseInt(logData1[1]);
        expect(liquidatedPositionSize1.toString()).to.be.equal("10000000000000000");
        const positionSizeafterLiquidation = await accountBalance1.getPositionSize(
          account4.address,
          volmexBaseToken.address,
        );
        const openNotionalAfterLiquidation = await accountBalance1.getOpenNotional(
          account4.address,
          volmexBaseToken.address,
        );
        expect(positionSizeafterLiquidation.toString()).to.be.equal("32980000000000000000");
        expect(openNotionalAfterLiquidation.toString()).to.be.equal("-1980580920000000001242");
        const accountValueafter2 = await vaultController.getAccountValue(account4.address);
        const freeCollateral = await vaultController.getFreeCollateralByRatio(
          account4.address,
          200000,
        );
        expect(
          await accountBalance1.isAccountLiquidatable(
            account4.address,
            volmexBaseToken.address,
            "10000000000000000",
            accountValueafter2.toString(),
            freeCollateral.toString(),
          ),
        ).to.be.equal(true);
      });
      it("should liquidate 0.8 of N_max_order", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account1.address, twoThousand.toString());
        await USDC.mint(account3.address, twoThousand.toString());
        await USDC.mint(account4.address, oneThousand.toString());
        await USDC.mint(account2.address, oneThousand.toString());
        await USDC.connect(account2).approve(vault.address, oneThousand.toString());
        await USDC.connect(account1).approve(vault.address, twoThousand.toString());
        await USDC.connect(account4).approve(vault.address, oneThousand.toString());
        await USDC.connect(account3).approve(vault.address, fivehundred.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, twoThousand.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, twoThousand.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, oneThousand.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            twoThousand.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            oneThousand.toString(),
          );
        await vaultController
          .connect(account2)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account2.address,
            oneThousand.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account1.address,
            twoThousand.toString(),
          );
        const orderLeft = Order(
          ORDER,
          87654321987654,
          account3.address,
          Asset(volmexBaseToken.address, BigNumber.from("70").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("4000").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight = Order(
          ORDER,
          87654321987654,
          account4.address,
          Asset(virtualToken.address, BigNumber.from("4000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("70").mul(one).toString()),
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

        expect(positionSize.toString()).to.be.equal("-70000000000000000000");
        expect(positionSize1.toString()).to.be.equal("70000000000000000000");

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
        for (let index = 0; index < 1; index++) {
          await (await perpetualOracle.addIndexObservations([0], [70000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [70000000], [proofHash])).wait();
        }

        console.log(
          (await vaultController.getFreeCollateralByRatio(account4.address, "200000")).toString(),
          "free collateral by ratio",
        );

        const orderLeft1 = Order(
          ORDER,
          87654321987654,
          account2.address,
          Asset(volmexBaseToken.address, BigNumber.from("20").mul(one).toString()),
          Asset(virtualToken.address, BigNumber.from("1000").mul(one).toString()),
          1,
          0,
          true,
        );

        const orderRight1 = Order(
          ORDER,
          87654321987654,
          account1.address,
          Asset(virtualToken.address, BigNumber.from("1000").mul(one).toString()),
          Asset(volmexBaseToken.address, BigNumber.from("20").mul(one).toString()),
          1,
          0,
          false,
        );
        let signatureLeft1 = await getSignature(orderLeft1, account2.address);
        let signatureRight1 = await getSignature(orderRight1, account1.address);

        await expect(
          positioning.openPosition(
            orderLeft1,
            signatureLeft1,
            orderRight1,
            signatureRight1,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");

        await time.increase(2000);
        for (let index = 0; index < 50; index++) {
          await (await perpetualOracle.addIndexObservations([0], [25000000], [proofHash])).wait();
          await (await perpetualOracle.addIndexObservations([1], [25000000], [proofHash])).wait();
        }
        const n_maxOrderSize = await matchingEngine.getMaxOrderSizeOverTime(
          volmexBaseToken.address,
        );
        // 238097140000000000000;
        // 41142852000000000000;
        const n_max_08 = n_maxOrderSize.mul(BigNumber.from("80")).div(BigNumber.from("100"));
        console.log(n_max_08.toString(), "80 % of n max");
        const accountValueafter = await vaultController.getAccountValue(account4.address);
        console.log(accountValueafter.toString(), " account value after");
        const liquidatbalePositionSize1 = await accountBalance1.getLiquidatablePositionSize(
          account4.address,
          volmexBaseToken.address,
          accountValueafter.toString(),
        );
        console.log(liquidatbalePositionSize1.toString(), " liquidatbale size");
        const liquidation = await positioning
          .connect(account1)
          .liquidate(
            account4.address,
            volmexBaseToken.address,
            liquidatbalePositionSize1.toString(),
          );
        const { events } = await liquidation.wait();

        let data;
        events.forEach((log: any) => {
          if (log["event"] == "PositionLiquidated") {
            data = log["data"];
          }
        });
        const logData = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data,
        );
        const liquidatedPositionSize = parseInt(logData[1]);
        console.log(liquidatedPositionSize, " liquidated size");
        expect(liquidatedPositionSize).to.be.lessThan(parseInt(liquidatbalePositionSize1));
      });
      it("should fail to liquidate for stale pracle price", async () => {
        await positioning.setMinPositionSize("10000000000000000000", volmexBaseToken.address);
        await positioning.whitelistLiquidator(account1.address, true);
        await USDC.mint(account1.address, fivehundred.toString());
        await USDC.mint(account3.address, fivehundred.toString());
        await USDC.mint(account4.address, fivehundred.toString());
        await USDC.connect(account1).approve(vault.address, fivehundred.toString());
        await USDC.connect(account4).approve(vault.address, fivehundred.toString());
        await USDC.connect(account3).approve(vault.address, fivehundred.toString());
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account3).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await USDC.connect(account4).approve(volmexPerpPeriphery.address, fivehundred.toString());
        await vaultController
          .connect(account3)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account3.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account4)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
            account4.address,
            fivehundred.toString(),
          );
        await vaultController
          .connect(account1)
          .deposit(
            volmexPerpPeriphery.address,
            USDC.address,
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
        await time.increase(3600);
        await expect(
          positioning
            .connect(account1)
            .liquidate(account4.address, volmexBaseToken.address, "20000000000000000000"),
        ).to.be.revertedWith("P_SIP");
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
