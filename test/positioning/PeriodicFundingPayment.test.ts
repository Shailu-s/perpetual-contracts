import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { BigNumber } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
describe("Periodic Funding payment", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let ERC20TransferProxyTest;
  let Positioning;
  let positioning;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let PerpetualOracle;
  let perpetualOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let VolmexPerpView;
  let perpView;

  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let TestERC20;
  let USDC;
  let owner, account1, account2, account3, account4, alice, bob;
  let liquidator;
  const deadline = 87654321987654;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  const index = 0;
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const capRatio = "400000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    Positioning = await ethers.getContractFactory("Positioning");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    [owner, account1, account2, account3, account4, alice, bob] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  this.beforeEach(async () => {
    const volatilityTokenPrice1 = "1000000";
    const volatilityTokenPrice2 = "1000000";

    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

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
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken.address],
        [75000000, 60000000],
        [58000000, 50000000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    volmexQuoteToken = await upgrades.deployProxy(
      VolmexQuoteToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexQuoteToken.deployed();
    await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);
    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);

    await accountBalance1.deployed();
    await (await perpView.setAccount(accountBalance1.address)).wait();
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    await vaultController.deployed();
    await (await perpView.setVaultController(vaultController.address)).wait();

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);
    await vault.deployed();
    await (await perpView.incrementVaultIndex()).wait();

    (await accountBalance1.grantSettleRealizedPnlRole(vault.address)).wait();
    (await accountBalance1.grantSettleRealizedPnlRole(vaultController.address)).wait();

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        0,
        [owner.address, account1.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await perpView.setPositioning(positioning.address)).wait();
    await (await perpView.incrementPerpIndex()).wait();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

    marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("10000000000000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await perpetualOracle.setIndexObservationAdder(owner.address)).wait();
    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await perpetualOracle.setMarkObservationAdder(matchingEngine.address)).wait();
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await (await perpetualOracle.setPositioning(positioning.address)).wait();
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);

    await volmexPerpPeriphery.deployed();
    await USDC.transfer(account1.address, "1000000000000000000000000");
    await USDC.transfer(account2.address, "1000000000000000000000000");
    await USDC.transfer(alice.address, "1000000000000000000000000");
    await USDC.transfer(bob.address, "1000000000000000000000000");

    await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
    await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
    await USDC.connect(bob).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
    await volmexPerpPeriphery.whitelistTrader(alice.address, true);
    await volmexPerpPeriphery.whitelistTrader(bob.address, true);
    await volmexPerpPeriphery.whitelistTrader(account1.address, true);
    await volmexPerpPeriphery.whitelistTrader(account2.address, true);

    (
      await volmexPerpPeriphery
        .connect(account1)
        .depositToVault(index, USDC.address, "1000000000000000000000000")
    ).wait();
    (
      await volmexPerpPeriphery
        .connect(account2)
        .depositToVault(index, USDC.address, "1000000000000000000000000")
    ).wait();
    (
      await volmexPerpPeriphery
        .connect(alice)
        .depositToVault(index, USDC.address, "1000000000000000000000000")
    ).wait();
    (
      await volmexPerpPeriphery
        .connect(bob)
        .depositToVault(index, USDC.address, "1000000000000000000000000")
    ).wait();
    await perpetualOracle.setIndexObservationAdder(owner.address);
    for (let i = 0; i < 10; i++) {
      await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
    }
  });

  describe("Periodic Funding Payment", function () {
    it("Funding payment should not change in before 8 hours", async () => {
      const price = await accountBalance1.getIndexPrice(volmexBaseToken.address, 28800);
      await matchingEngine.grantMatchOrders(positioning.address);
      expect(price.toString()).to.equal("75000000");

      const orderLeft = Order(
        ORDER,
        87654321987654,
        account1.address,
        Asset(volmexBaseToken.address, "1200000000000000000"),
        Asset(virtualToken.address, "1200000000000000000"),
        1,
        0,
        true,
      );

      const orderRight = Order(
        ORDER,
        87654321987654,
        account2.address,
        Asset(virtualToken.address, "1200000000000000000"),
        Asset(volmexBaseToken.address, "1200000000000000000"),
        2,
        0,
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);

      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const accountInfo1 = await accountBalance1.getAccountInfo(
        account1.address,
        volmexBaseToken.address,
      );

      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000000000000000"),
          Asset(virtualToken.address, "100000000000000000000"),
          i,
          (1e6).toString(),
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "100000000000000000000"),
          Asset(volmexBaseToken.address, "100000000000000000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        const tr = await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      await time.increase(20000);
      const stamp = await time.latest();
      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment1.toString()).to.equal(fundingPayment3.toString());
      expect(fundingPayment2.toString()).to.equal(fundingPayment4.toString());

      const accountInfo2 = await accountBalance1.getAccountInfo(
        account1.address,
        volmexBaseToken.address,
      );

      expect(accountInfo2.lastTwPremiumGrowthGlobal.toString()).to.equal(
        accountInfo1.lastTwPremiumGrowthGlobal.toString(),
      );
    });

    it("How funding payment changes for multiple orders when trader goes short and long multiple times", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, one.toString()),
        1,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, one.toString()),
        Asset(volmexBaseToken.address, one.toString()),
        2,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000000000"),
          Asset(virtualToken.address, "100000000000000"),
          i,
          (1e6).toString(),
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "100000000000000"),
          Asset(volmexBaseToken.address, "100000000000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }

      const accountInfo1 = await accountBalance1.getAccountInfo(
        alice.address,
        volmexBaseToken.address,
      );
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      for (let i = 67; i < 68; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "10000"),
          Asset(virtualToken.address, "10000"),
          i,
          (1e6).toString(),
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "10000"),
          Asset(volmexBaseToken.address, "10000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }

      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      expect(parseInt(fundingPayment3)).to.be.greaterThan(parseInt(fundingPayment1));
      expect(parseInt(fundingPayment4)).to.be.lessThan(parseInt(fundingPayment2));

      const accountInfo2 = await accountBalance1.getAccountInfo(
        alice.address,
        volmexBaseToken.address,
      );

      expect(accountInfo1.lastTwPremiumGrowthGlobal.toString()).to.not.equal(
        accountInfo2.lastTwPremiumGrowthGlobal.toString(),
      );
    });

    it("Changes in funding payment when trader goes (short and long)  and long and short susequently ", async () => {
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        5,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        6,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment1.toString()).to.equal("0");
      expect(fundingPayment2.toString()).to.equal("0");

      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "10000000000"),
          Asset(virtualToken.address, "100000000000"),
          i,
          (1e6).toString(),
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "100000000000"),
          Asset(volmexBaseToken.address, "10000000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }

      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, one.toString()),
        10,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, one.toString()),
        Asset(volmexBaseToken.address, one.toString()),
        20,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account2.address);
      const signatureRight1 = await getSignature(orderRight1, account1.address);

      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const accountInfo1 = await accountBalance1.getAccountInfo(
        alice.address,
        volmexBaseToken.address,
      );
      expect(accountInfo1.lastTwPremiumGrowthGlobal.toString()).to.equal("0");
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      for (let i = 30; i < 31; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "10000000000"),
          Asset(virtualToken.address, "100000000000"),
          i,
          (1e6).toString(),
          true,
        );

        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "100000000000"),
          Asset(volmexBaseToken.address, "10000000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }

      const fundingPayment5 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment6 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(parseInt(fundingPayment3)).to.be.lessThan(parseInt(fundingPayment5));
      expect(parseInt(fundingPayment4)).to.greaterThan(parseInt(fundingPayment6));
      const accountInfo3 = await accountBalance1.getAccountInfo(
        alice.address,
        volmexBaseToken.address,
      );

      expect(accountInfo3.lastTwPremiumGrowthGlobal.toString()).to.not.equal(
        accountInfo1.lastTwPremiumGrowthGlobal.toString(),
      );
    });

    it("How funding payment behaves during 8 hour cycle", async () => {
      await USDC.transfer(account1.address, "1000000000000000000");
      await USDC.transfer(account2.address, "1000000000000000000");
      await USDC.transfer(alice.address, "1000000000000000000");
      await USDC.transfer(bob.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(alice).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(bob).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(alice.address, true);
      await volmexPerpPeriphery.whitelistTrader(bob.address, true);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);

      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(alice)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(bob)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        5,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        6,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account2.address);
      const signatureRight = await getSignature(orderRight, account1.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const orderLeft1 = Order(
        ORDER,
        deadline,
        alice.address,
        Asset(volmexBaseToken.address, "100000000"),
        Asset(virtualToken.address, "1000000000"),
        456,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        bob.address,
        Asset(virtualToken.address, "1000000000"),
        Asset(volmexBaseToken.address, "100000000"),
        134,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, alice.address);
      const signatureRight1 = await getSignature(orderRight1, bob.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );

      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000"),
          Asset(virtualToken.address, "1000000000"),
          i,
          (1e6).toString(),
          true,
        );
        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "1000000000"),
          Asset(volmexBaseToken.address, "100000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }

      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment1.toString()).to.equal("0");
      expect(fundingPayment2.toString()).to.equal("0");

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment3.toString()).to.not.equal(fundingPayment1.toString());
      expect(fundingPayment4.toString()).to.not.equal(fundingPayment2.toString());
    });

    it("How funding payment behaves during mutiple 8 hour cycle", async () => {
      await USDC.transfer(account1.address, "1000000000000000000");
      await USDC.transfer(account2.address, "1000000000000000000");
      await USDC.transfer(alice.address, "1000000000000000000");
      await USDC.transfer(bob.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(alice).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(bob).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(alice.address, true);
      await volmexPerpPeriphery.whitelistTrader(bob.address, true);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);

      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(alice)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(bob)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      const orderLeft = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        5,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        6,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account2.address);
      const signatureRight = await getSignature(orderRight, account1.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const orderLeft1 = Order(
        ORDER,
        deadline,
        alice.address,
        Asset(volmexBaseToken.address, "100000000"),
        Asset(virtualToken.address, "1000000000"),
        456,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        bob.address,
        Asset(virtualToken.address, "1000000000"),
        Asset(volmexBaseToken.address, "100000000"),
        134,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, alice.address);
      const signatureRight1 = await getSignature(orderRight1, bob.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000"),
          Asset(virtualToken.address, "1000000000"),
          i,
          (1e6).toString(),
          true,
        );
        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "1000000000"),
          Asset(volmexBaseToken.address, "100000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      expect(fundingPayment1.toString()).to.equal("0");
      expect(fundingPayment2.toString()).to.equal("0");

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }

      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }

      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      expect(fundingPayment3.toString()).to.not.equal(fundingPayment1.toString());
      expect(fundingPayment4.toString()).to.not.equal(fundingPayment2.toString());
      for (let i = 56; i < 60; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000"),
          Asset(virtualToken.address, "1000000000"),
          i,
          (1e6).toString(),
          true,
        );
        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "1000000000"),
          Asset(volmexBaseToken.address, "100000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      const fundingPayment5 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment6 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment5.toString()).to.not.equal(fundingPayment3.toString());
      expect(fundingPayment6.toString()).to.not.equal(fundingPayment4.toString());
    });

    it("Funding payment of trader should update after 8 hours", async () => {
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        5,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        6,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account2.address);
      const signatureRight = await getSignature(orderRight, account1.address);

      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const orderLeft2 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        50,
        (1e6).toString(),
        true,
      );
      const orderRight2 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        60,
        (1e6).toString(),
        false,
      );

      const signatureLeft2 = await getSignature(orderLeft2, account2.address);
      const signatureRight2 = await getSignature(orderRight2, account1.address);

      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft2,
        signatureLeft2,
        orderRight2,
        signatureRight2,
        liquidator,
      );

      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      expect(fundingPayment1.toString()).to.equal("0");
      expect(fundingPayment2.toString()).to.equal("0");
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await time.increase(14000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      for (let i = 34; i < 38; i++) {
        const orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, "100000000"),
          Asset(virtualToken.address, "1000000000"),
          i,
          (1e6).toString(),
          true,
        );
        const orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(virtualToken.address, "1000000000"),
          Asset(volmexBaseToken.address, "100000000"),
          i + 1,
          (1e6).toString(),
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        await volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
      }
      const orderLeft1 = Order(
        ORDER,
        deadline,
        alice.address,
        Asset(volmexBaseToken.address, "100000000"),
        Asset(virtualToken.address, "1000000000"),
        456,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        bob.address,
        Asset(virtualToken.address, "1000000000"),
        Asset(volmexBaseToken.address, "100000000"),
        134,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, alice.address);
      const signatureRight1 = await getSignature(orderRight1, bob.address);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const fundingPayment3 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment4 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      const fundingPayment5 = await positioning.getPendingFundingPayment(
        alice.address,
        volmexBaseToken.address,
      );
      const fundingPayment6 = await positioning.getPendingFundingPayment(
        bob.address,
        volmexBaseToken.address,
      );
      const accountInfo = await accountBalance1.getAccountInfo(
        account1.address,
        volmexBaseToken.address,
      );

      const accountInfo1 = await accountBalance1.getAccountInfo(
        alice.address,
        volmexBaseToken.address,
      );

      await time.increase(15000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      const fundingPayment7 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );

      const fundingPayment8 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      const fundingPayment9 = await positioning.getPendingFundingPayment(
        alice.address,
        volmexBaseToken.address,
      );
      const fundingPayment10 = await positioning.getPendingFundingPayment(
        bob.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment3.toString()).to.not.equal(fundingPayment7.toString());
      expect(fundingPayment4.toString()).to.not.equal(fundingPayment8.toString());
      console.log("Funding payment of trader 1 and  trader 2 updated after complete 8 hours");
      expect(fundingPayment5.toString()).to.not.equal(fundingPayment9.toString());
      expect(fundingPayment6.toString()).to.not.equal(fundingPayment10.toString());
      console.log(
        "Funding payment of alice and  bob not updated after complete 1st 8 hours cycle",
      );

      await time.increase(30000);
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [75000000], [proofHash]);
      }
      const fundingPayment11 = await positioning.getPendingFundingPayment(
        alice.address,
        volmexBaseToken.address,
      );
      const fundingPayment12 = await positioning.getPendingFundingPayment(
        bob.address,
        volmexBaseToken.address,
      );

      expect(fundingPayment9.toString()).to.not.equal(fundingPayment11.toString());
      expect(fundingPayment10.toString()).to.not.equal(fundingPayment12.toString());
    });
  });

  describe("funding payment test with numbers", () => {
    let MatchingEngine;
    let matchingEngine;
    let VirtualToken;
    let virtualToken;
    let ERC20TransferProxyTest;
    let Positioning;
    let positioning;
    let PositioningConfig;
    let positioningConfig;
    let Vault;
    let vault;
    let VaultController;
    let vaultController;
    let AccountBalance;
    let PerpetualOracle;
    let perpetualOracle;
    let VolmexBaseToken;
    let volmexBaseToken;
    let VolmexQuoteToken;
    let volmexQuoteToken;
    let VolmexPerpPeriphery;
    let volmexPerpPeriphery;
    let VolmexPerpView;
    let perpView;

    let accountBalance1;
    let MarketRegistry;
    let marketRegistry;
    let TestERC20;
    let USDC;
    let owner, account1, account2, account3, account4, alice, bob;
    let liquidator;
    const deadline = 87654321987654;
    const one = ethers.constants.WeiPerEther; // 1e18
    const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
    const index = 0;
    const ORDER = "0xf555eb98";
    const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
    const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
    const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
    const capRatio = "400000000";
    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
    async function getSignature(orderObj, signer) {
      return sign(orderObj, signer, positioning.address);
    }
    this.beforeAll(async () => {
      VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
      PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
      MatchingEngine = await ethers.getContractFactory("MatchingEngine");
      VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
      ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
      Positioning = await ethers.getContractFactory("Positioning");
      PositioningConfig = await ethers.getContractFactory("PositioningConfig");
      Vault = await ethers.getContractFactory("Vault");
      VaultController = await ethers.getContractFactory("VaultController");
      MarketRegistry = await ethers.getContractFactory("MarketRegistry");
      AccountBalance = await ethers.getContractFactory("AccountBalance");
      TestERC20 = await ethers.getContractFactory("TestERC20");
      VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
      VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
      VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
      [owner, account1, account2, account3, account4, alice, bob] = await ethers.getSigners();
      liquidator = encodeAddress(owner.address);
    });

    this.beforeEach(async () => {
      const volatilityTokenPrice1 = "1000000";
      const volatilityTokenPrice2 = "1000000";

      perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
      await perpView.deployed();
      await (await perpView.grantViewStatesRole(owner.address)).wait();

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

      await (await perpView.setBaseToken(volmexBaseToken.address)).wait();
      perpetualOracle = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [volmexBaseToken.address, volmexBaseToken.address],
          [200000000, 200000000],
          [200060000, 200060000],
          [proofHash, proofHash],
          owner.address,
        ],
        { initializer: "__Perpetual_Oracles_Init" },
      );
      await perpetualOracle.deployed();
      await volmexBaseToken.setPriceFeed(perpetualOracle.address);
      volmexQuoteToken = await upgrades.deployProxy(
        VolmexQuoteToken,
        [
          "VolmexBaseToken", // nameArg
          "VBT", // symbolArg,
          false, // isBase
        ],
        {
          initializer: "initialize",
        },
      );
      await volmexQuoteToken.deployed();
      await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

      positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
      await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
      USDC = await TestERC20.deploy();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
      await USDC.deployed();

      matchingEngine = await upgrades.deployProxy(MatchingEngine, [
        owner.address,
        perpetualOracle.address,
      ]);
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

      virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
        initializer: "initialize",
      });
      await virtualToken.deployed();

      accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);

      await accountBalance1.deployed();
      await (await perpView.setAccount(accountBalance1.address)).wait();
      vaultController = await upgrades.deployProxy(VaultController, [
        positioningConfig.address,
        accountBalance1.address,
      ]);
      await vaultController.deployed();
      await (await perpView.setVaultController(vaultController.address)).wait();

      vault = await upgrades.deployProxy(Vault, [
        positioningConfig.address,
        accountBalance1.address,
        USDC.address,
        vaultController.address,
      ]);
      await vault.deployed();
      await (await perpView.incrementVaultIndex()).wait();

      (await accountBalance1.grantSettleRealizedPnlRole(vault.address)).wait();
      (await accountBalance1.grantSettleRealizedPnlRole(vaultController.address)).wait();

      positioning = await upgrades.deployProxy(
        Positioning,
        [
          positioningConfig.address,
          vaultController.address,
          accountBalance1.address,
          matchingEngine.address,
          perpetualOracle.address,
          0,
          [owner.address, account1.address],
        ],
        {
          initializer: "initialize",
        },
      );
      await positioning.deployed();
      await (await perpView.setPositioning(positioning.address)).wait();
      await (await perpView.incrementPerpIndex()).wait();
      await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
      await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

      marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);

      await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
      await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
      await marketRegistry.connect(owner).setTakerFeeRatio(0.0004e6);

      await accountBalance1.connect(owner).setPositioning(positioning.address);

      await vault.connect(owner).setPositioning(positioning.address);
      await vault.connect(owner).setVaultController(vaultController.address);
      await vaultController.registerVault(vault.address, USDC.address);
      await vaultController.connect(owner).setPositioning(positioning.address);

      await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
      await positioningConfig
        .connect(owner)
        .setSettlementTokenBalanceCap("10000000000000000000000000000000000000000000");

      await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
      await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
      await positioning.connect(owner).setPositioning(positioning.address);

      await (await perpetualOracle.setIndexObservationAdder(owner.address)).wait();
      await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
      await (await perpetualOracle.setMarkObservationAdder(matchingEngine.address)).wait();
      volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
        perpView.address,
        perpetualOracle.address,
        [vault.address, vault.address],
        owner.address,
        owner.address, // replace with replayer address
      ]);
      await (await perpetualOracle.setPositioning(positioning.address)).wait();
      await positioningConfig.setPositioning(positioning.address);
      await positioningConfig.setAccountBalance(accountBalance1.address);
      await positioningConfig.setTwapInterval(28800);

      await volmexPerpPeriphery.deployed();
      await USDC.transfer(account1.address, "1000000000000000000000000");
      await USDC.transfer(account2.address, "1000000000000000000000000");
      await USDC.transfer(alice.address, "1000000000000000000000000");
      await USDC.transfer(bob.address, "1000000000000000000000000");

      await USDC.connect(account1).approve(
        volmexPerpPeriphery.address,
        "1000000000000000000000000",
      );
      await USDC.connect(account2).approve(
        volmexPerpPeriphery.address,
        "1000000000000000000000000",
      );
      await USDC.connect(alice).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
      await USDC.connect(bob).approve(volmexPerpPeriphery.address, "1000000000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(alice.address, true);
      await volmexPerpPeriphery.whitelistTrader(bob.address, true);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);

      // (
      //   await volmexPerpPeriphery
      //     .connect(account1)
      //     .depositToVault(index, USDC.address, "1000000000000000000000000")
      // ).wait();
      // (
      //   await volmexPerpPeriphery
      //     .connect(account2)
      //     .depositToVault(index, USDC.address, "1000000000000000000000000")
      // ).wait();
      // (
      //   await volmexPerpPeriphery
      //     .connect(alice)
      //     .depositToVault(index, USDC.address, "1000000000000000000000000")
      // ).wait();
      // (
      //   await volmexPerpPeriphery
      //     .connect(bob)
      //     .depositToVault(index, USDC.address, "1000000000000000000000000")
      // ).wait();
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100);
    it("Funding should not occur is user closes his position before 8 hours", async () => {
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 100; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 100; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");
      console.log("1st case");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );

      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);
      await time.increase(28800);

      expect(traderCollateral.toString()).to.be.equal("999839951919976000000");
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100) - funding payment;
    it("funding should occur", async () => {
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      console.log("open position");
      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );

      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await time.increase(10000);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      console.log((await vaultController.getAccountValue(account4.address)).toString());
      console.log("close position");
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const traderCollateral3 = await vaultController.getFreeCollateralByRatio(
        account3.address,
        1,
      );
      expect(traderCollateral3.toString()).to.be.equal("999819951919976000000");
      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);
      expect(traderCollateral.toString()).to.be.equal("999859951919976000000");
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100) - funding payment in last cycle
    it("Funding should occur during multiple cycles", async () => {
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      console.log("open position");
      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );
      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      await time.increase(10000);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await time.increase(10000);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const traderCollateral3 = await vaultController.getFreeCollateralByRatio(
        account3.address,
        1,
      );
      expect(traderCollateral3.toString()).to.be.equal("999799951919976000000");
      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);

      expect(traderCollateral.toString()).to.be.equal("999879951919976000000");
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100) - funding payment in last cycle
    it("should test clamp upper bound ", async () => {
      await positioningConfig.setMaxFundingRate("7300");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );
      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      console.log(
        (await vaultController.getFreeCollateralByRatio(account4.address, 1)).toString(),
        "in test",
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await time.increase(10000);

      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 400000000);
      }
      const timestamp = await time.latest();

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      console.log("vault balance", (await USDC.balanceOf(vault.address)).toString());
      console.log(
        "account value ",
        (await vaultController.getAccountValue(account3.address)).toString(),
      );
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      console.log(
        (
          await positioning.getPendingFundingPayment(account4.address, volmexBaseToken.address)
        ).toString(),
        "in test",
      );
      console.log(
        (await vaultController.getFreeCollateralByRatio(account4.address, 1)).toString(),
        "in test",
      );
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);
      expect(traderCollateral.toString()).to.be.equal("999859951919976000000");
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100) - funding payment in last cycle
    it("should test clamp lower bound ", async () => {
      await positioningConfig.setMaxFundingRate("7300");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );
      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await time.increase(10000);

      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 10000000);
      }
      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);
      expect(traderCollateral.toString()).to.be.equal("999849950919976000000");
    });
    // Fees deduction
    // user collateral = 1000
    // when user opens  position his collateral value  = 1000 - (200.06 *4/100);
    // when user closes position his collateral value  = 1000 - (200.06 *4/100) - (200.06 *4/100) - funding payment in last cycle
    it("Testing when funding rate goes positive to negative from cycle 1 to cycle 2", async () => {
      await positioningConfig.setMaxFundingRate("800000");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 200060000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      await USDC.transfer(account4.address, "1000000000000000000");
      await USDC.transfer(account3.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account4).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      await volmexPerpPeriphery.whitelistTrader(account4.address, true);

      (
        await volmexPerpPeriphery
          .connect(account4)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account3)
          .depositToVault(index, USDC.address, "1000000000")
      ).wait();

      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        256,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft,
        signatureLeft,
        orderRight,
        signatureRight,
        liquidator,
      );
      const positionSize1 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize2 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );
      expect(positionSize1.toString()).to.be.equal("1000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-1000000000000000000");
      await perpetualOracle.setMarkObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await (await perpetualOracle.addMarkObservation(0, 400000000)).wait();
      }
      await time.increase(10000);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await time.increase(10000);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 10000000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }

      await time.increase(18800);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [200000000], [proofHash]);
      }
      await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "1000000000000000000"),
        Asset(virtualToken.address, "200060000000000000000"),
        500,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "200060000000000000000"),
        Asset(volmexBaseToken.address, "1000000000000000000"),
        400,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const traderCollateral = await vaultController.getFreeCollateralByRatio(account4.address, 1);
      expect(traderCollateral.toString()).to.be.equal("999866615919976000000");
    });
  });
});
