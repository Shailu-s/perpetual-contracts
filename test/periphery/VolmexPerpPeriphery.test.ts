import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { smock } from "@defi-wonderland/smock";
import { parseUnits, zeroPad } from "ethers/lib/utils";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { BigNumber } from "ethers";

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

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [70000000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
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
      [[60000000], [volmexBaseToken.address], [proofHash], [capRatio], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address]);

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      markPriceOracle.address,
    ]);

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
    await markPriceOracle.grantTwapIntervalRole(positioningConfig.address);
    await positioningConfig.connect(owner).setTwapInterval(28800);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("100000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await markPriceOracle.setPositioning(positioning.address)).wait();
    await (await markPriceOracle.setIndexOracle(indexPriceOracle.address)).wait();

    await markPriceOracle.setObservationAdder(matchingEngine.address);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
  });

  describe("Funding payment", () => {
    const depositAmount = BigNumber.from("100000000000000");
    let baseAmount = "50000000000000"; //50
    let quoteAmount = "100000000000000"; //100
    this.beforeEach(async () => {
      // transfer balances
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
          "Mark price": (await markPriceOracle.getMarkTwap("3600", 0)).toString(),
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
            "Mark price": (await markPriceOracle.getMarkTwap("3600", 0)).toString(),
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
  });

  describe("VolmexPerpPeriphery deployment", async () => {
    it("should deploy VolmexPerpPeriphery", async () => {
      volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
        perpView.address,
        markPriceOracle.address,
        indexPriceOracle.address,
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
          markPriceOracle.address,
          indexPriceOracle.address,
          [vault.address, vault.address],
          ZERO_ADDR,
          owner.address, // replace with relayer address
        ]),
      ).to.be.revertedWith("VolmexPerpPeriphery: Admin can't be address(0)");
    });
    it("should fail to initialize again", async () => {
      await expect(
        volmexPerpPeriphery.initialize(
          perpView.address,
          markPriceOracle.address,
          indexPriceOracle.address,
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
          markPriceOracle.address,
          indexPriceOracle.address,
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
  });

  describe("Add a vault to white list", function () {
    it("Add vault to white list", async () => {
      const vault1 = await upgrades.deployProxy(Vault, [
        positioningConfig.address,
        accountBalance1.address,
        USDC.address,
        accountBalance1.address,
        false,
      ]);
      expect(await volmexPerpPeriphery.whitelistVault(vault1.address, true))
        .to.emit(volmexPerpPeriphery, "VaultWhitelisted")
        .withArgs(vault1.address, true);
    });
  });

  describe("Set MarkPriceOracle", async () => {
    it("should set MarkPriceOracle", async () => {
      let receipt = await volmexPerpPeriphery.setMarkPriceOracle(markPriceOracle.address);
      expect(receipt.confirmations).not.equal(0);
    });

    it("should fail to set MarkPriceOracle if not admin", async () => {
      await expect(
        volmexPerpPeriphery.connect(account2).setMarkPriceOracle(markPriceOracle.address),
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
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, one.toString()),
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
        (1e8).toString(),
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
    const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
    this.beforeEach(async () => {
      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, one.toString()),
        1,
        (1e6).toString(),
        true,
      );

      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, one.toString()),
        Asset(volmexBaseToken.address, one.toString()),
        2,
        (1e6).toString(),
        false,
      );
    });

    it("Should open the position", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "100000000");
      await await USDC.transfer(account2.address, "100000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "100000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "100000000")
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

      expect(positionSize).to.be.equal("-1000000000000000000");
      expect(positionSize1).to.be.equal("1000000000000000000");
    });
    describe("Bulk Methods", function () {
      it("should open position in batch", async () => {
        const ordersLeft = [];
        const ordersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
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
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          (1e6).toString(),
          true,
        );
        ordersLeft.push(orderLeft);
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
      it(" should fill limit order in batch", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
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
      it("should fail to fill batch orders", async () => {
        const limitOrdersLeft = [];
        const limitOrdersRight = [];
        const signaturesLeft = [];
        const signaturesRight = [];
        await await USDC.transfer(account1.address, "1000000000");
        await await USDC.transfer(account2.address, "1000000000");
        await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
        await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
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
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          (1e6).toString(),
          true,
        );
        ordersLeft.push(orderLeft);
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
