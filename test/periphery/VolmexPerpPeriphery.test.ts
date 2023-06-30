import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { parseUnits, zeroPad } from "ethers/lib/utils";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { BigNumber } from "ethers";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const { expectRevert } = require("@openzeppelin/test-helpers");

describe("VolmexPerpPeriphery", function () {
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
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let volmexBaseToken;
  let volmexBaseToken1;
  let volmexBaseToken2;
  let volmexBaseToken3;
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
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const ORDER = "0xf555eb98";
  const traderWhiteListerRole =
    "0x2fb89cb8e2c481f376f65f284214892b25912128a308376bc38815249326e026";
  const STOP_LOSS_INDEX_PRICE = "0x835d5c1e";
  const STOP_LOSS_LAST_PRICE = "0xd9ed8042";
  const STOP_LOSS_MARK_PRICE = "0xe144c7ec";
  const TAKE_PROFIT_INDEX_PRICE = "0x67393efa";
  const TAKE_PROFIT_LAST_PRICE = "0xc7dc86f6";
  const TAKE_PROFIT_MARK_PRICE = "0xb6d64e04";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
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
    TestERC20 = await ethers.getContractFactory("TetherToken");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    [owner, account1, account2, account3, account4, alice, bob] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    volmexBaseToken = await upgrades.deployProxy(
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
    await volmexBaseToken.deployed();
    await (await perpView.setBaseToken(volmexBaseToken.address)).wait();
    volmexBaseToken1 = await upgrades.deployProxy(
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
    await volmexBaseToken1.deployed();
    await (await perpView.setBaseToken(volmexBaseToken1.address)).wait();
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
    await (await perpView.setBaseToken(volmexBaseToken2.address)).wait();
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
    await (await perpView.setBaseToken(volmexBaseToken3.address)).wait();
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
        [100000000, 100000000, 1800000000, 30800000000],
        [100000000, 100000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken1.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken3.setPriceFeed(perpetualOracle.address);
    await volmexBaseToken2.setPriceFeed(perpetualOracle.address);
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

    USDC = await TestERC20.deploy("100000000000000000000000", "Tether USD", "USDT", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();

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
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      volmexQuoteToken.address,
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
        [owner.address, account1.address],
        ["10000000000000000000", "10000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await perpView.setPositioning(positioning.address)).wait();
    await (await perpView.incrementPerpIndex()).wait();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexBaseToken2.setMintBurnRole(positioning.address)).wait();
    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.connect(owner).setTwapInterval(28800);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("100000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await perpetualOracle.setPositioning(positioning.address)).wait();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await perpetualOracle.grantCacheChainlinkPriceRole(owner.address);
    await perpetualOracle.grantCacheChainlinkPriceRole(positioning.address);
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
  });

  describe("Funding payment", () => {
    const depositAmount = BigNumber.from("100000000000000");
    let baseAmount = "10000000000000000000"; //50
    let quoteAmount = "100000000000000000000"; //100
    this.beforeEach(async () => {
      // transfer balances
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
      }
      await (await USDC.connect(owner).transfer(alice.address, depositAmount)).wait();
      await (await USDC.connect(owner).transfer(bob.address, depositAmount)).wait();

      // approve to vault
      await (await USDC.connect(owner).approve(volmexPerpPeriphery.address, depositAmount)).wait();
      await (await USDC.connect(alice).approve(volmexPerpPeriphery.address, depositAmount)).wait();
      await (await USDC.connect(bob).approve(volmexPerpPeriphery.address, depositAmount)).wait();

      // deposit to vault
      await (
        await volmexPerpPeriphery.connect(owner).depositToVault(0, USDC.address, depositAmount)
      ).wait();
      await (
        await volmexPerpPeriphery.connect(alice).depositToVault(0, USDC.address, depositAmount)
      ).wait();
      await (
        await volmexPerpPeriphery.connect(bob).depositToVault(0, USDC.address, depositAmount)
      ).wait();
    });

    it("Open position", async () => {
      await expect(volmexPerpPeriphery.whitelistTrader(alice.address, true)).to.emit(
        volmexPerpPeriphery,
        "TraderWhitelisted",
      );
      await expect(volmexPerpPeriphery.whitelistTrader(bob.address, true)).to.emit(
        volmexPerpPeriphery,
        "TraderWhitelisted",
      );

      let salt = 250;
      let txBefore = [];
      for (let index = 0; index < 10; index++) {
        let orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, baseAmount),
          Asset(volmexQuoteToken.address, quoteAmount),
          salt,
          0,
          true,
        );

        let orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, quoteAmount),
          Asset(volmexBaseToken.address, baseAmount),
          salt++,
          0,
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        const tx = await volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
        const receipt = await tx.wait();
        let txDataBefore = {
          "Mark price": (await perpetualOracle.lastestLastPriceSMA(0, "3600")).toString(),
          "Alice position": (
            await accountBalance1.getPositionSize(alice.address, volmexBaseToken.address)
          ).toString(),
          "Alice owed and un realized pnl": (
            await accountBalance1.getPnlAndPendingFee(alice.address)
          ).toString(),
          "Bob position": (
            await accountBalance1.getPositionSize(bob.address, volmexBaseToken.address)
          ).toString(),
          "Bob owed and un realized pnl": (
            await accountBalance1.getPnlAndPendingFee(bob.address)
          ).toString(),
        };
        txBefore.push(txDataBefore);
        if (index == 9) {
          let orderLeft = Order(
            ORDER,
            deadline,
            alice.address,
            Asset(volmexQuoteToken.address, quoteAmount),
            Asset(volmexBaseToken.address, baseAmount),
            salt++,
            0,
            false,
          );

          let orderRight = Order(
            ORDER,
            deadline,
            bob.address,
            Asset(volmexBaseToken.address, baseAmount),
            Asset(volmexQuoteToken.address, quoteAmount),
            salt++,
            0,
            true,
          );

          const signatureLeft = await getSignature(orderLeft, alice.address);
          const signatureRight = await getSignature(orderRight, bob.address);

          const tx = await volmexPerpPeriphery.openPosition(
            0,
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          );
          const receipt = await tx.wait();
          txDataBefore = {
            "Mark price": (await perpetualOracle.lastestLastPriceSMA(0, "3600")).toString(),
            "Alice position": (
              await accountBalance1.getPositionSize(alice.address, volmexBaseToken.address)
            ).toString(),
            "Alice owed and un realized pnl": (
              await accountBalance1.getPnlAndPendingFee(alice.address)
            ).toString(),
            "Bob position": (
              await accountBalance1.getPositionSize(bob.address, volmexBaseToken.address)
            ).toString(),
            "Bob owed and un realized pnl": (
              await accountBalance1.getPnlAndPendingFee(bob.address)
            ).toString(),
          };
          txBefore.push(txDataBefore);
        }
      }
    });

    it("Open position when not whitelisted", async () => {
      let salt = 250;
      let txBefore = [];
      await volmexPerpPeriphery.toggleTraderWhitelistEnabled();
      for (let index = 0; index < 10; index++) {
        let orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, baseAmount),
          Asset(volmexQuoteToken.address, quoteAmount),
          salt,
          0,
          true,
        );

        let orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, quoteAmount),
          Asset(volmexBaseToken.address, baseAmount),
          salt++,
          0,
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);

        await expect(
          volmexPerpPeriphery.openPosition(
            0,
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");
      }
    });

    it("Open position when not whitelisted", async () => {
      let salt = 250;
      let txBefore = [];
      await volmexPerpPeriphery.toggleTraderWhitelistEnabled();
      for (let index = 0; index < 10; index++) {
        let orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, baseAmount),
          Asset(volmexQuoteToken.address, quoteAmount),
          salt,
          0,
          true,
        );

        let orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, quoteAmount),
          Asset(volmexBaseToken.address, baseAmount),
          salt++,
          0,
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);

        await expect(
          volmexPerpPeriphery.openPosition(
            0,
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.emit(positioning, "PositionChanged");
      }
    });
    it("should not Open position trader is not when not whitelisted", async () => {
      let salt = 250;
      let txBefore = [];
      for (let index = 0; index < 10; index++) {
        let orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, baseAmount),
          Asset(volmexQuoteToken.address, quoteAmount),
          salt,
          0,
          true,
        );

        let orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, quoteAmount),
          Asset(volmexBaseToken.address, baseAmount),
          salt++,
          0,
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);

        await expect(
          volmexPerpPeriphery.openPosition(
            0,
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          ),
        ).to.be.revertedWith("Periphery: trader not whitelisted");
      }
    });

    it("Open position", async () => {
      await expect(volmexPerpPeriphery.whitelistTrader(alice.address, true)).to.emit(
        volmexPerpPeriphery,
        "TraderWhitelisted",
      );
      await expect(volmexPerpPeriphery.whitelistTrader(bob.address, true)).to.emit(
        volmexPerpPeriphery,
        "TraderWhitelisted",
      );

      let salt = 250;
      let txBefore = [];
      for (let index = 0; index < 10; index++) {
        let orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, baseAmount),
          Asset(volmexQuoteToken.address, quoteAmount),
          salt,
          0,
          true,
        );

        let orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, quoteAmount),
          Asset(volmexBaseToken.address, baseAmount),
          salt++,
          0,
          false,
        );

        const signatureLeft = await getSignature(orderLeft, alice.address);
        const signatureRight = await getSignature(orderRight, bob.address);
        const tx = await volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        );
        const receipt = await tx.wait();
        let txDataBefore = {
          "Mark price": (await perpetualOracle.lastestLastPriceSMA(0, "3600")).toString(),
          "Alice position": (
            await accountBalance1.getPositionSize(alice.address, volmexBaseToken.address)
          ).toString(),
          "Alice owed and un realized pnl": (
            await accountBalance1.getPnlAndPendingFee(alice.address)
          ).toString(),
          "Bob position": (
            await accountBalance1.getPositionSize(bob.address, volmexBaseToken.address)
          ).toString(),
          "Bob owed and un realized pnl": (
            await accountBalance1.getPnlAndPendingFee(bob.address)
          ).toString(),
        };
        txBefore.push(txDataBefore);
        if (index == 9) {
          let orderLeft = Order(
            ORDER,
            deadline,
            alice.address,
            Asset(volmexQuoteToken.address, "1000000000000000000000"),
            Asset(volmexBaseToken.address, "50000000000000000000"),
            salt++,
            0,
            false,
          );

          let orderRight = Order(
            ORDER,
            deadline,
            bob.address,
            Asset(volmexBaseToken.address, "50000000000000000000"),
            Asset(volmexQuoteToken.address, "1000000000000000000000"),
            salt++,
            0,
            true,
          );

          const signatureLeft = await getSignature(orderLeft, alice.address);
          const signatureRight = await getSignature(orderRight, bob.address);

          const tx = await volmexPerpPeriphery.openPosition(
            0,
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            liquidator,
          );
          const receipt = await tx.wait();
          txDataBefore = {
            "Mark price": (await perpetualOracle.lastestLastPriceSMA(0, "3600")).toString(),
            "Alice position": (
              await accountBalance1.getPositionSize(alice.address, volmexBaseToken.address)
            ).toString(),
            "Alice owed and un realized pnl": (
              await accountBalance1.getPnlAndPendingFee(alice.address)
            ).toString(),
            "Bob position": (
              await accountBalance1.getPositionSize(bob.address, volmexBaseToken.address)
            ).toString(),
            "Bob owed and un realized pnl": (
              await accountBalance1.getPnlAndPendingFee(bob.address)
            ).toString(),
          };
          txBefore.push(txDataBefore);
        }
      }
    });
  });
  describe("2x trading fees issue", () => {
    it("A user should be able to withdraw entire balance after closing and opening same position", async () => {
      await positioningConfig.setMaxFundingRate("7300");
      await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
      await marketRegistry.connect(owner).setTakerFeeRatio(0.0004e6);
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 99000000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
        await perpetualOracle.addIndexObservations([1], [100000000], [proofHash]);
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
        await volmexPerpPeriphery.connect(account4).depositToVault(0, USDC.address, "10000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account3).depositToVault(0, USDC.address, "10000000000")
      ).wait();

      // account4 sell order 1 EVIV @ 100 USDT
      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), // 1
        Asset(virtualToken.address, "100000000000000000000"), // 100
        256,
        (1e6).toString(),
        true,
      );
      // account3 buy order 1 EVIV @ 100 USDT
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      console.log("opening position");
      await volmexPerpPeriphery.openPosition(
        0,
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

      expect(positionSize1.toString()).to.be.equal("10000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-10000000000000000000");
      const traderCollateral1 = await vaultController.getFreeCollateralByRatio(
        account3.address,
        1000000,
      );
      await perpetualOracle.setMarkObservationAdder(owner.address);

      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
        await perpetualOracle.addIndexObservations([1], [100000000], [proofHash]);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 1500000000);
      }
      const timestamp = await time.latest();
      // await time.increase(18800);
      // for (let index = 0; index <= 10; index++) {
      //   await indexPriceOracle.addObservation([100000000], [0], [proofHash]);
      // }
      // for (let index = 0; index <= 10; index++) {
      //   await markPriceOracle.addObservation(1500000000, 0);
      // }

      // account3 sell order 1 EVIV @ 100 USDT
      let openNotional = await accountBalance1.getOpenNotional(
        account3.address,
        volmexBaseToken.address,
      );
      console.log(openNotional.toString(), " open notional");

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "100000000000000000000"), // 1 EVIV
        Asset(virtualToken.address, "1000000000000000000000"), // 100 USDT
        256,
        (1e6).toString(),
        true,
      );
      // account4 buy order 1 EVIV @ 100 USDT
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(virtualToken.address, "100000000000000000000"), // 100 USDT
        Asset(volmexBaseToken.address, "10000000000000000000"), // 1 EVIV
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      let indexsma = await perpetualOracle.latestIndexSMA(28800, 0);
      console.log("indexsma", indexsma.toString());
      let pendingFundingPayment = await positioning.getPendingFundingPayment(
        account3.address,
        volmexBaseToken.address,
      );
      // expect(pendingFundingPayment.toString()).to.be.equal("730000000000000000");
      console.log("closing positon");
      console.log(liquidator, " liquidator");
      await volmexPerpPeriphery.openPosition(
        0,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      let pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account3.address);
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account4.address);
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let realisedPnlTrader2 = pnlTrader2[0].toString();
      let realisedPnlTrader1 = pnlTrader1[0].toString();
      expect(unrealisedPnlTrader1).to.be.equal("0");

      expect(unrealisedPnlTrader2).to.be.equal("0");
      const positionSize3 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize4 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );

      pendingFundingPayment = await positioning.getPendingFundingPayment(
        account3.address,
        volmexBaseToken.address,
      );
      expect(pendingFundingPayment.toString()).to.be.equal("0");
      openNotional = await accountBalance1.getOpenNotional(
        account3.address,
        volmexBaseToken.address,
      );
      console.log(openNotional.toString(), "open notional");
      // 1 * 0.73%  * 100
      // max funding payment of 0.73 USDT
      // max funding payment = position size in EVIV * max funding rate * indexsma 8 hour
      const lastFundingrate = await positioning.getLastFundingRate(volmexBaseToken.address);
      const traderCollateral = await vaultController.getFreeCollateralByRatio(
        account3.address,
        200000,
      );

      expect(traderCollateral.toString()).to.be.equal("9999920000000000000000");
      const tx = await volmexPerpPeriphery
        .connect(account3)
        .withdrawFromVault("0", USDC.address, account3.address, "9999920000");
    });
    it("should not close his position and goes long again", async () => {
      await positioningConfig.setMaxFundingRate("7300");
      await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
      await marketRegistry.connect(owner).setTakerFeeRatio(0.0004e6);
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await perpetualOracle.setIndexObservationAdder(owner.address);
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 99000000);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
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
        await volmexPerpPeriphery.connect(account4).depositToVault(0, USDC.address, "10000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account3).depositToVault(0, USDC.address, "10000000000")
      ).wait();

      // account4 sell order 1 EVIV @ 100 USDT
      const orderLeft = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, "10000000000000000000"), // 1
        Asset(virtualToken.address, "100000000000000000000"), // 100
        256,
        (1e6).toString(),
        true,
      );
      // account3 buy order 1 EVIV @ 100 USDT
      const orderRight = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        890,
        (1e6).toString(),
        false,
      );

      const signatureLeft = await getSignature(orderLeft, account4.address);
      const signatureRight = await getSignature(orderRight, account3.address);
      console.log("opening position");
      await volmexPerpPeriphery.openPosition(
        0,
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

      expect(positionSize1.toString()).to.be.equal("10000000000000000000");
      expect(positionSize2.toString()).to.be.equal("-10000000000000000000");
      const traderCollateral1 = await vaultController.getFreeCollateralByRatio(
        account3.address,
        200000,
      );
      const traderCollateral2 = await vaultController.getFreeCollateralByRatio(
        account4.address,
        200000,
      );
      await perpetualOracle.setMarkObservationAdder(owner.address);
      await time.increase(10000);

      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addIndexObservations([0], [100000000], [proofHash]);
      }
      for (let index = 0; index <= 10; index++) {
        await perpetualOracle.addMarkObservation(0, 90000000);
      }
      const timestamp = await time.latest();
      // await time.increase(18800);
      // for (let index = 0; index <= 10; index++) {
      //   await indexPriceOracle.addObservation([100000000], [0], [proofHash]);
      // }
      // for (let index = 0; index <= 10; index++) {
      //   await markPriceOracle.addObservation(1500000000, 0);
      // }

      // account3 sell order 1 EVIV @ 100 USDT
      let openNotional = await accountBalance1.getOpenNotional(
        account3.address,
        volmexBaseToken.address,
      );
      const quoteValue1 = BigNumber.from(traderCollateral1.toString()).mul(470).div(100);
      const quoteValue2 = BigNumber.from(traderCollateral2.toString()).mul(470).div(100);
      console.log(quoteValue1.toString(), "quote value 1");
      console.log(quoteValue2.toString(), "quote value 2");
      const baseValue1 = quoteValue1.div(99);
      const baseValue2 = quoteValue2.div(99);
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, quoteValue1.toString()),
        Asset(volmexBaseToken.address, baseValue1.toString()),
        560,
        (1e6).toString(),
        false,
      );
      // account4 buy order 1 EVIV @ 100 USDT
      const orderRight1 = Order(
        ORDER,
        deadline,
        account4.address,
        Asset(volmexBaseToken.address, baseValue2.toString()),
        Asset(virtualToken.address, quoteValue2.toString()),
        900,
        (1e6).toString(),
        true,
      );

      const signatureLeft1 = await getSignature(orderLeft1, account3.address);
      const signatureRight1 = await getSignature(orderRight1, account4.address);
      let indexsma = await perpetualOracle.latestIndexSMA(28800, 0);
      console.log("indexsma", indexsma.toString());
      let pendingFundingPayment = await positioning.getPendingFundingPayment(
        account3.address,
        volmexBaseToken.address,
      );
      // expect(pendingFundingPayment.toString()).to.be.equal("730000000000000000");
      console.log("closing positon");
      console.log(liquidator, " liquidator");
      await volmexPerpPeriphery.openPosition(
        0,
        orderLeft1,
        signatureLeft1,
        orderRight1,
        signatureRight1,
        liquidator,
      );
      let pnlTrader1 = await accountBalance1.getPnlAndPendingFee(account3.address);
      let pnlTrader2 = await accountBalance1.getPnlAndPendingFee(account4.address);
      let unrealisedPnlTrader2 = pnlTrader2[1].toString();
      let unrealisedPnlTrader1 = pnlTrader1[1].toString();
      let realisedPnlTrader2 = pnlTrader2[0].toString();
      let realisedPnlTrader1 = pnlTrader1[0].toString();
      expect(unrealisedPnlTrader1).to.be.equal("1305751428735353535354");

      expect(unrealisedPnlTrader2).to.be.equal("-1339295278335353535352");
      const positionSize3 = await accountBalance1.getPositionSize(
        account3.address,
        volmexBaseToken.address,
      );
      const positionSize4 = await accountBalance1.getPositionSize(
        account4.address,
        volmexBaseToken.address,
      );

      pendingFundingPayment = await positioning.getPendingFundingPayment(
        account3.address,
        volmexBaseToken.address,
      );
      expect(pendingFundingPayment.toString()).to.be.equal("0");
      openNotional = await accountBalance1.getOpenNotional(
        account3.address,
        volmexBaseToken.address,
      );
      console.log(openNotional.toString(), " open notional");
      // 1 * 0.73%  * 100
      // max funding payment of 0.73 USDT
      // max funding payment = position size in EVIV * max funding rate * indexsma 8 hour
      const lastFundingrate = await positioning.getLastFundingRate(volmexBaseToken.address);
      const traderCollateral = await vaultController.getFreeCollateralByRatio(
        account3.address,
        200000,
      );

      expect(traderCollateral.toString()).to.be.equal("1610683215040000000011");
    });
  });
  describe("VolmexPerpPeriphery deployment", async () => {
    it("should deploy VolmexPerpPeriphery", async () => {
      volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
        perpView.address,
        perpetualOracle.address,
        [vault.address, vault.address],
        owner.address,
        owner.address, // replace with relayer address
      ]);
      let receipt = await volmexPerpPeriphery.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("should fail to deploy VolmexPerpPeriphery", async () => {
      await expect(
        upgrades.deployProxy(VolmexPerpPeriphery, [
          perpView.address,
          perpetualOracle.address,
          [vault.address, vault.address],
          ZERO_ADDR,
          owner.address, // replace with relayer address
        ]),
      ).to.be.revertedWith("VolmexPerpPeriphery: Admin can't be address(0)");
    });
    it("should fail to deploy VolmexPerpPeriphery when perp view address is zero", async () => {
      await expect(
        upgrades.deployProxy(VolmexPerpPeriphery, [
          ZERO_ADDR,
          perpetualOracle.address,
          [vault.address, vault.address],
          owner.address,
          owner.address, // replace with relayer address
        ]),
      ).to.be.revertedWith("VolmexPerpPeriphery: zero address");
    });

    it("should fail to initialize again", async () => {
      await expect(
        volmexPerpPeriphery.initialize(
          perpView.address,
          perpetualOracle.address,
          [vault.address, vault.address],
          owner.address,
          owner.address,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
    it("should fail to deploy VolmexPerpPeriphery since relayer address is 0", async () => {
      await expect(
        upgrades.deployProxy(VolmexPerpPeriphery, [
          perpView.address,
          perpetualOracle.address,
          [vault.address, vault.address],
          owner.address,
          ZERO_ADDR, // replace with relayer address
        ]),
      ).to.be.revertedWith("VolmexPerpPeriphery: Relayer can't be address(0)");
    });
  });
  it("Should fail to initialize quote token again", async () => {
    await expect(volmexQuoteToken.initialize("MytestToken", "MKT", true)).to.be.revertedWith(
      "Initializable: contract is already initialized",
    );
  });

  describe("set Relayer", function () {
    it("should set relayer", async () => {
      const [owner, account1] = await ethers.getSigners();
      expect(await volmexPerpPeriphery.setRelayer(account1.address))
        .to.emit(volmexPerpPeriphery, "RelayerUpdated")
        .withArgs(account1.address);
    });
    it("should fail to set relayer", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        volmexPerpPeriphery.setRelayer("0x0000000000000000000000000000000000000000"),
      ).to.be.revertedWith("VolmexPerpPeriphery: Not relayer");
    });
  });

  describe("onlyWhitelisted", async () => {
    it("shoyld set Trader white lister", async () => {
      await volmexPerpPeriphery.grantRole(traderWhiteListerRole, account1.address);
      const role = await volmexPerpPeriphery.hasRole(traderWhiteListerRole, account1.address);
      expect(role).to.equal(true);
    });
    it("should set onlyWhitelisted", async () => {
      volmexPerpPeriphery.toggleTraderWhitelistEnabled();
    });

    it("should fail to set onlyWhitelisted if caller doesn't have admin role", async () => {
      await expect(
        volmexPerpPeriphery.connect(account2).toggleTraderWhitelistEnabled(),
      ).to.be.revertedWith("Periphery: Not admin");
    });
    it("should fail to white list trader ", async () => {
      await expect(
        volmexPerpPeriphery.connect(account2).whitelistTrader(account2.address, true),
      ).to.be.revertedWith("VolmexPerpPeriphery: Not whitelister");
    });
  });

  describe("Add a vault to white list", function () {
    it("Add vault to white list", async () => {
      const vault1 = await upgrades.deployProxy(Vault, [
        positioningConfig.address,
        accountBalance1.address,
        USDC.address,
        accountBalance1.address,
      ]);
      expect(await volmexPerpPeriphery.whitelistVault(vault1.address, true))
        .to.emit(volmexPerpPeriphery, "VaultWhitelisted")
        .withArgs(vault1.address, true);
    });
  });

  describe("Set MarkPriceOracle", async () => {
    it("should set MarkPriceOracle", async () => {
      let receipt = await volmexPerpPeriphery.setPerpetualOracle(perpetualOracle.address);
      expect(receipt.confirmations).not.equal(0);
    });

    it("should fail to set MarkPriceOracle if not admin", async () => {
      await expect(
        volmexPerpPeriphery.connect(account2).setPerpetualOracle(perpetualOracle.address),
      ).to.be.revertedWith("Periphery: Not admin");
    });
  });

  describe("Fill Limit order", async () => {
    it("should fill LimitOrder", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"),
        Asset(virtualToken.address, "100000000000000000000"),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        1,
        (1e5).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      let receipt = await volmexPerpPeriphery.openPosition(
        0,
        orderLeft,
        signatureLeftLimitOrder,
        orderRight,
        signatureRightLimitOrder,
        owner.address,
      );
      expect(receipt.confirmations).not.equal(0);
    });
    it("should fill LimitOrder for chain link supported base tokens", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "180000000000",
        currentTimestamp.toString(),
        currentTimestamp.toString(),
      );
      await perpetualOracle.cacheChainlinkPrice(
        "57896044618658097711785492504343953926634992332820282019728792003956564819969",
      );
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken2.address, "10000000000000000000"),
        Asset(virtualToken.address, "18000000000000000000000"),
        1,
        (19e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, "18000000000000000000000"),
        Asset(volmexBaseToken2.address, "10000000000000000000"),
        1,
        (17e8).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      let receipt = await volmexPerpPeriphery.openPosition(
        0,
        orderLeft,
        signatureLeftLimitOrder,
        orderRight,
        signatureRightLimitOrder,
        owner.address,
      );
      expect(receipt.confirmations).not.equal(0);
    });

    it("should fail to add order due to expired deadline", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const timestamp = await time.latest();
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        timestamp - 9,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("V_PERP_M: Order deadline validation failed");
    });

    it("should fail when order trader is ZERO", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await volmexPerpPeriphery.setRelayer(account1.address);
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await volmexPerpPeriphery.whitelistTrader(ZERO_ADDR, true);
      const timestamp = await time.latest();
      const orderLeft = Order(
        ORDER,
        deadline,
        ZERO_ADDR,
        Asset(volmexBaseToken.address, "10000000000000000000"),
        Asset(virtualToken.address, "100000000000000000000"),
        0,
        (60e6).toString(),
        true,
      );

      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        1,
        (60e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery
          .connect(account1)
          .openPosition(
            0,
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            owner.address,
          ),
      ).to.be.revertedWith("P_NEFCI");
    });
    it("should fail when trader's try to hold a position less then min position size  ", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);
      await await USDC.transfer(account1.address, "100000000000");
      await volmexPerpPeriphery.setRelayer(account1.address);
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.transfer(account3.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account3).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account3).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await volmexPerpPeriphery.whitelistTrader(account3.address, true);
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"),
        Asset(virtualToken.address, "100000000000000000000"),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.emit(positioning, "PositionChanged");

      // When trader tries to go long on a short position of size 10 with a long position of size 9 which is less that min position size 10
      const orderRight1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, "90000000000000000000"),
        Asset(volmexBaseToken.address, "9000000000000000000"),
        6,
        (1e6).toString(),
        false,
      );
      const orderLeft1 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(volmexBaseToken.address, "9000000000000000000"),
        Asset(virtualToken.address, "90000000000000000000"),
        7,
        (1e8).toString(),
        true,
      );
      const signatureLeftLimitOrder1 = await getSignature(orderLeft1, account3.address);
      const signatureRightLimitOrder1 = await getSignature(orderRight1, account1.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderRight1,
          signatureRightLimitOrder1,
          orderLeft1,
          signatureLeftLimitOrder1,
          owner.address,
        ),
      ).to.be.revertedWith("V_PERP: TBMPS");

      // When trader tries to go short  on a long position of size 10 with a short position of size 9 which is less that min position size 10

      const orderRight2 = Order(
        ORDER,
        deadline,
        account3.address,
        Asset(virtualToken.address, "90000000000000000000"),
        Asset(volmexBaseToken.address, "9000000000000000000"),
        6,
        (1e6).toString(),
        false,
      );
      const orderLeft2 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, "9000000000000000000"),
        Asset(virtualToken.address, "90000000000000000000"),
        7,
        (1e8).toString(),
        true,
      );
      const signatureLeftLimitOrder2 = await getSignature(orderLeft2, account2.address);
      const signatureRightLimitOrder2 = await getSignature(orderRight2, account3.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft2,
          signatureLeftLimitOrder2,
          orderRight2,
          signatureRightLimitOrder2,
          owner.address,
        ),
      ).to.be.revertedWith("V_PERP: TBMPS");
    });
    it("should fail when order trader is ZERO and no trader ", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await volmexPerpPeriphery.setRelayer(account1.address);
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await volmexPerpPeriphery.whitelistTrader(ZERO_ADDR, true);
      const timestamp = await time.latest();
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        ZERO_ADDR,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await expect(
        volmexPerpPeriphery
          .connect(account1)
          .openPosition(
            0,
            orderLeft,
            "0x0000000000000000000000000000000000000000000000000000000000000000",
            orderRight,
            signatureRightLimitOrder,
            owner.address,
          ),
      ).to.be.revertedWith("V_PERP_M: no trader");
    });
    it("should fail to add order due same make and take asset as base token", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Both makeAsset & takeAsset can't be baseTokens");
    });
    it("should fail to add order due to different signer", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account2.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("V_PERP_M: order signature verification error");
    });

    it("should fail to add order due same short order take asset as base token", async () => {
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith(
        "Short order can't have takeAsset as a baseToken/Long order can't have makeAsset as baseToken",
      );
    });
    it("should fail to add order", async () => {
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery
          .connect(account1)
          .openPosition(
            0,
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            owner.address,
          ),
      ).to.be.revertedWith("VolmexPerpPeriphery: Not relayer");
    });
    it("should fail to fill stop loss limit order for chain link supported base tokens", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "180000000000",
        currentTimestamp.toString(),
        currentTimestamp.toString(),
      );
      await perpetualOracle.cacheChainlinkPrice(
        "57896044618658097711785492504343953926634992332820282019728792003956564819969",
      );
      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000000");
      (
        await volmexPerpPeriphery.connect(account1).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      (
        await volmexPerpPeriphery.connect(account2).depositToVault(0, USDC.address, "100000000000")
      ).wait();
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken2.address, "10000000000000000000"),
        Asset(virtualToken.address, "18000000000000000000000"),
        1,
        (17e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, "18000000000000000000000"),
        Asset(volmexBaseToken2.address, "10000000000000000000"),
        1,
        (17e8).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);

      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: left order price verification failed");
    });
    it("should fail to fill LimitOrder: Sell Stop Limit Order Trigger for index price Not Matched", async () => {
      const currentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383902",
        "180000000000",
        currentTimestamp.toString(),
        currentTimestamp.toString(),
      );
      await perpetualOracle.cacheChainlinkPrice(
        "57896044618658097711785492504343953926634992332820282019728792003956564819969",
      );
      const newCurrentTimestamp = await time.latest();
      await chainlinkAggregator1.updateRoundData(
        "162863638383904",
        "200000000000",
        newCurrentTimestamp.toString(),
        newCurrentTimestamp.toString(),
      );

      const orderLeft = Order(
        STOP_LOSS_INDEX_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken2.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (19e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_INDEX_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken2.address, two.toString()),
        1,
        (19e8).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: left order price verification failed");
    });
    it("should fail to fill LimitOrder: Sell Stop Limit Order Trigger Price Not Matched", async () => {
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e4).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e5).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: left order price verification failed");
    });

    it("should fail to fill LimitOrder: Buy Stop Limit Order Trigger Price Not Matched", async () => {
      const orderLeft = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (1e8).toString(),
        true,
      );

      const orderRight = Order(
        STOP_LOSS_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (11e7).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: right order price verification failed");
    });

    it("should fail to fill LimitOrder: Sell Take-profit Limit Order Trigger Price Not Matched", async () => {
      const orderLeft = Order(
        TAKE_PROFIT_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        (6e8).toString(),
        true,
      );

      const orderRight = Order(
        TAKE_PROFIT_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e6).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: left order price verification failed");
    });

    it("should fail to fill LimitOrder: Buy Take-profit Limit Order Trigger Price Not Matched", async () => {
      const orderLeft = Order(
        TAKE_PROFIT_MARK_PRICE,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, one.toString()),
        1,
        (1e5).toString(),
        true,
      );

      const orderRight = Order(
        TAKE_PROFIT_MARK_PRICE,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
        (1e4).toString(),
        false,
      );

      const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
      const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

      await matchingEngine.grantMatchOrders(positioning.address);
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      await expect(
        volmexPerpPeriphery.openPosition(
          0,
          orderLeft,
          signatureLeftLimitOrder,
          orderRight,
          signatureRightLimitOrder,
          owner.address,
        ),
      ).to.be.revertedWith("Periphery: right order price verification failed");
    });
  });

  describe("VolmexPerpPeriphery deployment", async () => {
    it("should deploy VolmexPerpPeriphery", async () => {
      let receipt = await volmexPerpPeriphery.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe("Deposit, Withdraw & Open position", async () => {
    let index;
    let amount;
    let vBalBefore;
    let vBalAfter;
    let vBalAfterWithdraw;
    let ownerBalBeforeWithdraw;
    let ownerBalAfterWithdraw;

    this.beforeEach(async () => {
      index = 0;
      amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap("1000000000000000");
      await USDC.connect(owner).approve(volmexPerpPeriphery.address, amount);

      vBalBefore = await USDC.balanceOf(vault.address);
      (await volmexPerpPeriphery.depositToVault(index, USDC.address, amount)).wait();
    });
    it("Should deposit the collateral to the vault", async () => {
      vBalAfter = await USDC.balanceOf(vault.address);
      expect(amount).to.equal(vBalAfter.sub(vBalBefore));
    });
    it("Should withdraw the collateral from the vault", async () => {
      ownerBalBeforeWithdraw = await USDC.balanceOf(owner.address);
      (
        await volmexPerpPeriphery.withdrawFromVault(index, USDC.address, owner.address, amount)
      ).wait();
      vBalAfterWithdraw = await USDC.balanceOf(vault.address);
      ownerBalAfterWithdraw = await USDC.balanceOf(owner.address);
      expect(amount).to.equal(vBalAfter.sub(vBalAfterWithdraw));
      expect(amount).to.equal(ownerBalAfterWithdraw.sub(ownerBalBeforeWithdraw));
    });
    it("Should fail to transfer to vault becuase vault address in not white listed", async () => {
      await expect(
        volmexPerpPeriphery
          .connect(account2)
          .transferToVault(USDC.address, owner.address, "10000000"),
      ).to.be.revertedWith("Periphery: vault not whitelisted");
    });
    let orderLeft;
    let orderRight;
    const deadline = 87654321987654;
    const one = ethers.constants.WeiPerEther; // 1e18
    const hundred = ethers.constants.WeiPerEther.mul(BigNumber.from("100")); // 2e18
    this.beforeEach(async () => {
      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"),
        Asset(virtualToken.address, hundred.toString()),
        1,
        (1e6).toString(),
        true,
      );

      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, hundred.toString()),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        2,
        (1e6).toString(),
        false,
      );
    });

    it("Should open the position but fail to with draw", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "10000000000");
      await await USDC.transfer(account2.address, "10000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "10000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "10000000000")
      ).wait();

      let signatureLeft = await getSignature(orderLeft, account1.address);
      let signatureRight = await getSignature(orderRight, account2.address);

      // opening the positions here
      await expect(
        volmexPerpPeriphery.openPosition(
          index,
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

      expect(positionSize).to.be.equal("-10000000000000000000");
      expect(positionSize1).to.be.equal("10000000000000000000");
      await time.increase(3600);
      await expect(
        volmexPerpPeriphery
          .connect(account1)
          .withdrawFromVault(index, USDC.address, account1.address, amount),
      ).to.be.revertedWith("VC_SIP");
    });
    it("Should open the position", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "10000000000");
      await await USDC.transfer(account2.address, "10000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "10000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "10000000000")
      ).wait();

      let signatureLeft = await getSignature(orderLeft, account1.address);
      let signatureRight = await getSignature(orderRight, account2.address);

      // opening the positions here
      await expect(
        volmexPerpPeriphery.openPosition(
          index,
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

      expect(positionSize).to.be.equal("-10000000000000000000");
      expect(positionSize1).to.be.equal("10000000000000000000");
    });
    it("Should fail after min salt is set", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "2000000000");
      await await USDC.transfer(account2.address, "2000000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "2000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "2000000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "2000000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "2000000000")
      ).wait();

      let signatureLeft = await getSignature(orderLeft, account1.address);
      let signatureRight = await getSignature(orderRight, account2.address);

      // opening the positions here
      await expect(
        volmexPerpPeriphery.openPosition(
          index,
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

      expect(positionSize).to.be.equal("-10000000000000000000");

      expect(positionSize1).to.be.equal("10000000000000000000");

      await (await matchingEngine.connect(account1).cancelAllOrders(5)).wait();
      await (await matchingEngine.connect(account2).cancelAllOrders(6)).wait();

      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, "10000000000000000000"),
        Asset(virtualToken.address, "100000000000000000000"),
        4,
        (1e6).toString(),
        true,
      );

      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, "100000000000000000000"),
        Asset(volmexBaseToken.address, "10000000000000000000"),
        5,
        (1e6).toString(),
        false,
      );

      signatureLeft = await getSignature(orderLeft, account1.address);
      signatureRight = await getSignature(orderRight, account2.address);

      // revert open position due to min salt
      await expectRevert(
        volmexPerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        ),
        "V_PERP_M: Order canceled",
      );
    });
    describe("Bulk Methods", function () {
      it("should open position in batch", async () => {
        const ordersLeft = [];
        const ordersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await matchingEngine.grantMatchOrders(positioning.address);
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e6).toString(),
          true,
        );
        ordersLeft.push(orderLeft);
        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          2,
          (1e6).toString(),
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
      });
      it("should batch validate orders", async () => {
        await matchingEngine.grantMatchOrders(positioning.address);
        await await USDC.transfer(account1.address, "1000000000");
        await await USDC.transfer(account2.address, "1000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "1000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "1000000000")
        ).wait();
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e6).toString(),
          true,
        );
        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          2,
          (1e6).toString(),
          false,
        );

        const orderInvalid = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          0,
          (1e6).toString(),
          false,
        );

        let orderArray = [orderLeft, orderRight, orderInvalid];

        let result = await volmexPerpPeriphery.batchOrderValidate(orderArray, index);
        expect(result[0]).to.be.equal(true);
        expect(result[1]).to.be.equal(true);
        expect(result[2]).to.be.equal(false);
      });
      it(" should fill limit order in batch", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          STOP_LOSS_MARK_PRICE,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e8).toString(),
          true,
        );

        const orderRight = Order(
          STOP_LOSS_MARK_PRICE,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          1,
          (1e5).toString(),
          false,
        );
        limitOrdersLeft.push(orderLeft);
        limitOrdersRight.push(orderRight);
        const signatureLeft = await getSignature(orderLeft, account1.address);
        const signatureRight = await getSignature(orderRight, account2.address);
        signaturesLeft.push(signatureLeft);
        signaturesRight.push(signatureRight);
        await matchingEngine.grantMatchOrders(positioning.address);
        await volmexPerpPeriphery.batchOpenPosition(
          index,
          limitOrdersLeft,
          signaturesLeft,
          limitOrdersRight,
          signaturesRight,
          liquidator,
        );
      });
      it("should fill stop loss index price and last price order order in batch", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          STOP_LOSS_INDEX_PRICE,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e8).toString(),
          true,
        );

        const orderRight = Order(
          STOP_LOSS_LAST_PRICE,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          1,
          (1e5).toString(),
          false,
        );
        limitOrdersLeft.push(orderLeft);
        limitOrdersRight.push(orderRight);
        const signatureLeft = await getSignature(orderLeft, account1.address);
        const signatureRight = await getSignature(orderRight, account2.address);
        signaturesLeft.push(signatureLeft);
        signaturesRight.push(signatureRight);
        await matchingEngine.grantMatchOrders(positioning.address);
        await volmexPerpPeriphery.batchOpenPosition(
          index,
          limitOrdersLeft,
          signaturesLeft,
          limitOrdersRight,
          signaturesRight,
          liquidator,
        );
      });
      it("should fill take profit index price and take profit last price order order in batch", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          TAKE_PROFIT_INDEX_PRICE,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e5).toString(),
          true,
        );

        const orderRight = Order(
          TAKE_PROFIT_LAST_PRICE,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          1,
          (1e8).toString(),
          false,
        );
        limitOrdersLeft.push(orderLeft);
        limitOrdersRight.push(orderRight);
        const signatureLeft = await getSignature(orderLeft, account1.address);
        const signatureRight = await getSignature(orderRight, account2.address);
        signaturesLeft.push(signatureLeft);
        signaturesRight.push(signatureRight);
        await matchingEngine.grantMatchOrders(positioning.address);
        await volmexPerpPeriphery.batchOpenPosition(
          index,
          limitOrdersLeft,
          signaturesLeft,
          limitOrdersRight,
          signaturesRight,
          liquidator,
        );
      });
      it("should fail to fill batch orders", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          STOP_LOSS_MARK_PRICE,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e8).toString(),
          true,
        );
        const orderRight = Order(
          STOP_LOSS_MARK_PRICE,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          1,
          (1e6).toString(),
          false,
        );
        limitOrdersLeft.push(orderLeft);
        limitOrdersRight.push(orderRight);
        const signatureLeft = await getSignature(orderLeft, account1.address);
        const signatureRight = await getSignature(orderRight, account2.address);
        signaturesLeft.push(signatureLeft);
        signaturesRight.push(signatureRight);
        limitOrdersLeft.push(orderLeft);
        await matchingEngine.grantMatchOrders(positioning.address);
        await expect(
          volmexPerpPeriphery.batchOpenPosition(
            index,
            limitOrdersLeft,
            signaturesLeft,
            limitOrdersRight,
            signaturesRight,
            liquidator,
          ),
        ).to.be.revertedWith("Periphery: mismatch orders");
      });
      it("should fail to open position in batch", async () => {
        const ordersLeft = [];
        const ordersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await matchingEngine.grantMatchOrders(positioning.address);
        await await USDC.transfer(account1.address, "10000000000");
        await await USDC.transfer(account2.address, "10000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "10000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "10000000000");
        await volmexPerpPeriphery.whitelistTrader(account1.address, true);
        await volmexPerpPeriphery.whitelistTrader(account2.address, true);
        (
          await volmexPerpPeriphery
            .connect(account1)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        (
          await volmexPerpPeriphery
            .connect(account2)
            .depositToVault(index, USDC.address, "10000000000")
        ).wait();
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, "10000000000000000000"),
          Asset(virtualToken.address, "10000000000000000000"),
          1,
          (1e6).toString(),
          true,
        );
        ordersLeft.push(orderLeft);
        const orderRight = Order(
          ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, "10000000000000000000"),
          Asset(volmexBaseToken.address, "10000000000000000000"),
          2,
          (1e6).toString(),
          false,
        );
        ordersRight.push(orderRight);
        ordersRight.push(orderRight);
        const signatureLeft = await getSignature(orderLeft, account1.address);
        signaturesLeft.push(signatureLeft);

        const signatureRight = await getSignature(orderRight, account2.address);
        signaturesRight.push(signatureRight);
        await expect(
          volmexPerpPeriphery.batchOpenPosition(
            index,
            ordersLeft,
            signaturesLeft,
            ordersRight,
            signaturesRight,
            liquidator,
          ),
        ).to.be.revertedWith("Periphery: mismatch orders");
      });
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
