import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { smock } from "@defi-wonderland/smock";
import { parseUnits, zeroPad } from "ethers/lib/utils";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { BigNumber } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("Funding payment test", function () {
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
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
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
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
      initializer: "initialize",
    });
    const volatilityIndex = "0";
    const volatilityTokenPrice1 = "1000000";
    const volatilityTokenPrice2 = "1000000";
    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

    await indexPriceOracle.updateTwapMaxDatapoints(2);

    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);
    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

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
    await (await perpView.setBaseToken(volmexBaseToken.address)).wait();

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

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[1000000], [volmexBaseToken.address]],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    positioningConfig = await upgrades.deployProxy(PositioningConfig, []);

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      markPriceOracle.address,
    ]);
    await markPriceOracle.setMatchingEngine(matchingEngine.address);

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
      false,
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
        markPriceOracle.address,
        indexPriceOracle.address,
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
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap("1000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await markPriceOracle.setMatchingEngine(owner.address)).wait();
    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    for (let i = 0; i < 9; i++) {
      await markPriceOracle.addObservation(100000000, 0);
    }

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      markPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
  });

  describe("Funding Payment", function () {
    it("Funding payment should not change in before 8 hours", async () => {
      const price = await accountBalance1.getIndexPrice(volmexBaseToken.address);
      console.log(price.toString());
      const ordersLeft = [];
      const ordersRight = [];
      const signaturesLeft = [];
      const signaturesRight = [];
      await matchingEngine.grantMatchOrders(positioning.address);
      await await USDC.transfer(account1.address, "1000000000000000000");
      await await USDC.transfer(account2.address, "10000000000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "10000000000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "10000000000000000")
      ).wait();
      const orderLeft = Order(
        ORDER,
        87654321987654,
        account1.address,
        Asset(volmexBaseToken.address, "120000000000"),
        Asset(virtualToken.address, "120000000000"),
        1,
        0,
        true,
      );
      ordersLeft.push(orderLeft);
      const orderRight = Order(
        ORDER,
        87654321987654,
        account2.address,
        Asset(virtualToken.address, "120000000000"),
        Asset(volmexBaseToken.address, "120000000000"),
        2,
        0,
        false,
      );
      ordersRight.push(orderRight);
      const signatureLeft = await getSignature(orderLeft, account1.address);
      signaturesLeft.push(signatureLeft);

      const signatureRight = await getSignature(orderRight, account2.address);
      signaturesRight.push(signatureRight);

      await volmexPerpPeriphery.batchOpenPosition(
        index,
        ordersLeft,
        signaturesLeft,
        ordersRight,
        signaturesRight,
        liquidator,
      );

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "120000000000"),
        Asset(virtualToken.address, "120000000000"),
        10,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "12000000000"),
        Asset(volmexBaseToken.address, "12000000000"),
        20,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account1.address);
      const signatureRight1 = await getSignature(orderRight1, account2.address);
      await volmexPerpPeriphery.openPosition(
        index,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      time.increase(240000);
      expect(fundingPayment1.toString()).to.be.equal(fundingPayment2.toString());
      console.log(fundingPayment2.toString());
      const { lastTwPremiumGrowthGlobal } = await accountBalance1.getAccountInfo(
        account1.address,
        volmexBaseToken.address,
      );
      console.log(lastTwPremiumGrowthGlobal.toString());
    });
    it("How funding payment changes for multiple orders", async () => {
      await await USDC.transfer(account1.address, "1000000000000000000");
      await await USDC.transfer(account2.address, "1000000000000000000");
      await matchingEngine.grantMatchOrders(positioning.address);
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000000000000");
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
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e6).toString(),
        true,
      );
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
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
      const fundingPayment1 = await positioning.getPendingFundingPayment(
        account1.address,
        volmexBaseToken.address,
      );
      const fundingPayment2 = await positioning.getPendingFundingPayment(
        account2.address,
        volmexBaseToken.address,
      );
      console.log(fundingPayment1.toString(), "Funding payment trader 2 ");
      console.log(fundingPayment2.toString(), "Funding payment trader 2 ");

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        10,
        (1e6).toString(),
        true,
      );
      const orderRight1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        20,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account1.address);
      const signatureRight1 = await getSignature(orderRight1, account2.address);
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
      console.log(fundingPayment3.toString(), "Funding payment trader 1 ");
      console.log(fundingPayment4.toString(), "Funding payment trader 2 ");
      const { lastTwPremiumGrowthGlobal } = await accountBalance1.getAccountInfo(
        account1.address,
        volmexBaseToken.address,
      );
      console.log(lastTwPremiumGrowthGlobal.toString());
    });
  });
});
