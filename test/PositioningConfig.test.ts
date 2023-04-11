import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("PositioningConfig", function () {
  let PositioningConfig;
  let positioningConfig;
  let MarkPriceOracle;
  let markPriceOracle;
  let owner, account1;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

  this.beforeAll(async () => {
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    [owner, account1] = await ethers.getSigners();
  });

  this.beforeEach(async () => {
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[100000], [account1.address], [proofHash], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address], {
      initializer: "initialize",
    });
    await positioningConfig.deployed();
    await markPriceOracle.grantTwapIntervalRole(positioningConfig.address);
  });

  describe("Deployment", () => {
    it("should deploy PositioningConfig", async () => {
      let receipt = await positioningConfig.deployed();
      expect(receipt.confirmations).not.equal(0);
    });

    it("should deploy without calling initialize", async () => {
      const positioningConfig1 = await PositioningConfig.deploy();
      let receipt = await positioningConfig1.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe("setLiquidationPenaltyRatio", async () => {
    it("should setLiquidationPenaltyRatio for ratio < 1e6", async () => {
      await expect(positioningConfig.setLiquidationPenaltyRatio(0.05e6))
        .to.emit(positioningConfig, "LiquidationPenaltyRatioChanged")
        .withArgs(50000);

      const liquidationPenaltyRatio = await positioningConfig.getLiquidationPenaltyRatio();
      await expect(liquidationPenaltyRatio).to.be.equal(50000);
    });

    it("should set mark Price oracle mark twap interval to 500", async () => {
      await positioningConfig.setTwapInterval(500);
      const twap = await markPriceOracle.markTwInterval();
      expect(parseInt(twap)).to.be.equal(500);
    });

    it("should setLiquidationPenaltyRatio for ratio = 1e6", async () => {
      await expect(positioningConfig.setLiquidationPenaltyRatio(1e6))
        .to.emit(positioningConfig, "LiquidationPenaltyRatioChanged")
        .withArgs(1000000);
      const liquidationPenaltyRatio = await positioningConfig.getLiquidationPenaltyRatio();
      await expect(liquidationPenaltyRatio).to.be.equal(1e6);
    });

    it("should fail to set LiquidationPenaltyRatio for ratio > 1e6", async () => {
      await expect(positioningConfig.setLiquidationPenaltyRatio(5e6)).to.be.revertedWith("PC_RO");
    });

    it("should fail to set LiquidationPenaltyRatio as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setLiquidationPenaltyRatio(0.05e6),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });
  });

  describe("setPartialCloseRatio", async () => {
    it("should setPartialCloseRatio for ratio < 1e6", async () => {
      await expect(positioningConfig.setPartialCloseRatio(0.025e6))
        .to.emit(positioningConfig, "PartialCloseRatioChanged")
        .withArgs(0.025e6);
      const partialCloseRatio = await positioningConfig.getPartialCloseRatio();
      await expect(partialCloseRatio).to.equal(0.025e6);
    });

    it("should setPartialCloseRatio for ratio = 1e6", async () => {
      await expect(positioningConfig.setPartialCloseRatio(1e6))
        .to.emit(positioningConfig, "PartialCloseRatioChanged")
        .withArgs(1e6);
      const partialCloseRatio = await positioningConfig.getPartialCloseRatio();
      await expect(partialCloseRatio).to.equal(1e6);
    });

    it("should setPartialCloseRatio for ratio > 1e6", async () => {
      await expect(positioningConfig.setPartialCloseRatio(2e6)).to.be.revertedWith("PC_RO");
    });

    it("should fail to setPartialCloseRatio as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setPartialCloseRatio(1e6),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });

    it("should fail to setPartialCloseRatio for ratio = 0", async () => {
      await expect(positioningConfig.setPartialCloseRatio(0)).to.be.revertedWith("PC_IPCR");
    });
  });

  describe("setTwapInterval", async () => {
    it("should setTwapInterval", async () => {
      // type(uint32).max = 2e32 - 1 = 4294967295
      await expect(positioningConfig.setTwapInterval("4294967295"))
        .to.emit(positioningConfig, "TwapIntervalChanged")
        .withArgs(4294967295);
      const twapInterval = await positioningConfig.getTwapInterval();
      await expect(twapInterval).to.equal(4294967295);
    });

    it("should fail to setTwapInterval to 0", async () => {
      await expect(positioningConfig.setTwapInterval("0")).to.be.revertedWith("PC_ITI");
    });

    it("should fail to setTwapInterval as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setTwapInterval("4294967295"),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });
  });

  describe("setMaxMarketsPerAccount", async () => {
    // uint8 => [0, type(uint8).max, 2]
    it("should setMaxMarketsPerAccount to 0", async () => {
      await expect(positioningConfig.setMaxMarketsPerAccount(0))
        .to.emit(positioningConfig, "MaxMarketsPerAccountChanged")
        .withArgs(0);
      const maxMarketsPerAccount = await positioningConfig.getMaxMarketsPerAccount();
      expect(maxMarketsPerAccount).to.equal(0);
    });

    it("should setMaxMarketsPerAccount to max uint8", async () => {
      // max uint8 = 2^8 - 1 = 255
      await expect(positioningConfig.setMaxMarketsPerAccount(255))
        .to.emit(positioningConfig, "MaxMarketsPerAccountChanged")
        .withArgs(255);
      const maxMarketsPerAccount = await positioningConfig.getMaxMarketsPerAccount();
      expect(maxMarketsPerAccount).to.equal(255);
    });

    it("should setMaxMarketsPerAccount to a value b/w 0 - max(uint8)", async () => {
      await expect(positioningConfig.setMaxMarketsPerAccount(2))
        .to.emit(positioningConfig, "MaxMarketsPerAccountChanged")
        .withArgs(2);
      const maxMarketsPerAccount = await positioningConfig.getMaxMarketsPerAccount();
      expect(maxMarketsPerAccount).to.equal(2);
    });

    // not admin
    it("should fail to setMaxMarketsPerAccount as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setMaxMarketsPerAccount(2),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });
  });

  describe("setSettlementTokenBalanceCap", async () => {
    it("should setSettlementTokenBalanceCap to 0", async () => {
      await expect(positioningConfig.setSettlementTokenBalanceCap(0))
        .to.emit(positioningConfig, "SettlementTokenBalanceCapChanged")
        .withArgs(0);
      const settlementTokenBalanceCap = await positioningConfig.getSettlementTokenBalanceCap();
      expect(settlementTokenBalanceCap).to.equal(0);
    });

    it("should setSettlementTokenBalanceCap to value b/w 0 & uint256", async () => {
      await expect(positioningConfig.setSettlementTokenBalanceCap(1e6))
        .to.emit(positioningConfig, "SettlementTokenBalanceCapChanged")
        .withArgs(1e6);
      const settlementTokenBalanceCap = await positioningConfig.getSettlementTokenBalanceCap();
      expect(settlementTokenBalanceCap).to.equal(1e6);
    });

    it("should setSettlementTokenBalanceCap to max value uint256", async () => {
      const maxUint256 =
        "115792089237316195423570985008687907853269984665640564039457584007913129639935";
      await expect(positioningConfig.setSettlementTokenBalanceCap(maxUint256))
        .to.emit(positioningConfig, "SettlementTokenBalanceCapChanged")
        .withArgs(maxUint256);
      const settlementTokenBalanceCap = await positioningConfig.getSettlementTokenBalanceCap();
      expect(settlementTokenBalanceCap).to.equal(maxUint256);
    });

    it("should fail to setSettlementTokenBalanceCap as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setSettlementTokenBalanceCap(1e6),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });
  });

  describe("setMaxFundingRate", async () => {
    it("should setMaxFundingRate to 0", async () => {
      await expect(positioningConfig.setMaxFundingRate(0))
        .to.emit(positioningConfig, "MaxFundingRateChanged")
        .withArgs(0);
      const maxFundingRate = await positioningConfig.getMaxFundingRate();
      expect(maxFundingRate).to.equal(0);
    });

    it("should setMaxFundingRate to value b/w 0 & uint24", async () => {
      await expect(positioningConfig.setMaxFundingRate(1e6))
        .to.emit(positioningConfig, "MaxFundingRateChanged")
        .withArgs(1e6);
      const maxFundingRate = await positioningConfig.getMaxFundingRate();
      expect(maxFundingRate).to.equal(1e6);
    });

    it("should setMaxFundingRate to max value uint24", async () => {
      const maxUint24 = 16777215;
      await expect(positioningConfig.setMaxFundingRate(maxUint24))
        .to.emit(positioningConfig, "MaxFundingRateChanged")
        .withArgs(maxUint24);
      const maxFundingRate = await positioningConfig.getMaxFundingRate();
      expect(maxFundingRate).to.equal(maxUint24);
    });

    it("should fail to setMaxFundingRate as caller is not admin", async () => {
      await expect(positioningConfig.connect(account1).setMaxFundingRate(1e6)).to.be.revertedWith(
        "PositioningConfig: Not admin",
      );
    });
  });

  describe("setImRatio", async () => {
    it("should setImRatio for ratio < 1e6", async () => {
      await expect(positioningConfig.setImRatio(0.025e6))
        .to.emit(positioningConfig, "InitialMarginChanged")
        .withArgs(0.025e6);
      const imRatio = await positioningConfig.getImRatio();
      await expect(imRatio).to.equal(0.025e6);
    });

    it("should setImRatio for ratio = 1e6", async () => {
      await expect(positioningConfig.setImRatio(1e6))
        .to.emit(positioningConfig, "InitialMarginChanged")
        .withArgs(1e6);
      const imRatio = await positioningConfig.getImRatio();
      await expect(imRatio).to.equal(1e6);
    });

    it("should fail to setImRatio for ratio > 1e6", async () => {
      await expect(positioningConfig.setImRatio(2e6)).to.be.revertedWith("PC_RO");
    });

    it("should fail to setImRatio as caller is not admin", async () => {
      await expect(positioningConfig.connect(account1).setImRatio(1e6)).to.be.revertedWith(
        "PositioningConfig: Not admin",
      );
    });

    it("should fail to setImRatio for ratio = 0", async () => {
      await expect(positioningConfig.setImRatio(0)).to.be.revertedWith("PC_IIMR");
    });
  });

  describe("setMmRatio", async () => {
    it("should setMmRatio for ratio < 1e6", async () => {
      await expect(positioningConfig.setMmRatio(0.025e6))
        .to.emit(positioningConfig, "MaintenanceMarginChanged")
        .withArgs(0.025e6);
      const mmRatio = await positioningConfig.getMmRatio();
      await expect(mmRatio).to.equal(0.025e6);
    });

    it("should setMmRatio for ratio = 1e6", async () => {
      await expect(positioningConfig.setMmRatio(1e6))
        .to.emit(positioningConfig, "MaintenanceMarginChanged")
        .withArgs(1e6);
      const mmRatio = await positioningConfig.getMmRatio();
      await expect(mmRatio).to.equal(1e6);
    });

    it("should fail to setMmRatio for ratio > 1e6", async () => {
      await expect(positioningConfig.setMmRatio(2e6)).to.be.revertedWith("PC_RO");
    });

    it("should fail to setMmRatio as caller is not admin", async () => {
      await expect(positioningConfig.connect(account1).setMmRatio(1e6)).to.be.revertedWith(
        "PositioningConfig: Not admin",
      );
    });

    it("should fail to setMmRatio for ratio = 0", async () => {
      await expect(positioningConfig.setMmRatio(0)).to.be.revertedWith("PC_IMMR");
    });
  });

  describe("setPartialLiquidationRatio", async () => {
    it("should setPartialLiquidationRatio for ratio < 1e6", async () => {
      await expect(positioningConfig.setPartialLiquidationRatio(0.025e6))
        .to.emit(positioningConfig, "PartialLiquidationRatioChanged")
        .withArgs(0.025e6);
      const partialLiquidationRatio = await positioningConfig.getPartialLiquidationRatio();
      await expect(partialLiquidationRatio).to.equal(0.025e6);
    });

    it("should setPartialLiquidationRatio for ratio = 1e6", async () => {
      await expect(positioningConfig.setPartialLiquidationRatio(1e6))
        .to.emit(positioningConfig, "PartialLiquidationRatioChanged")
        .withArgs(1e6);
      const partialLiquidationRatio = await positioningConfig.getPartialLiquidationRatio();
      await expect(partialLiquidationRatio).to.equal(1e6);
    });

    it("should fail to setPartialLiquidationRatio for ratio > 1e6", async () => {
      await expect(positioningConfig.setPartialLiquidationRatio(2e6)).to.be.revertedWith("PC_RO");
    });

    it("should fail to setPartialLiquidationRatio as caller is not admin", async () => {
      await expect(
        positioningConfig.connect(account1).setPartialLiquidationRatio(1e6),
      ).to.be.revertedWith("PositioningConfig: Not admin");
    });

    it("should fail to setPartialLiquidationRatio for ratio = 0", async () => {
      await expect(positioningConfig.setPartialLiquidationRatio(0)).to.be.revertedWith("PC_IPLR");
    });
  });
});
