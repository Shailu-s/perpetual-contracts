import { expect, util } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { utils } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("perpetualOracle", function () {
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
  let owner, account1, account2, account3, alice, bob;
  let liquidator;
  const deadline = 87654321987654;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const initialTimeStampRole =
    "0x8426feed6a25f9f5e06c145118f728dcb93a441fbf150f1e4c2e84c5ffd3c927";
  const capRatio = "250";
  const twapType = "0x1444f8cf";

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
    [owner, account1, account2, account3, alice, bob] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  beforeEach(async () => {
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

    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken.address],
        [60000000, 60000000],
        [60000000, 60000000],
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

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

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
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("1000000000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await perpetualOracle.setPositioning(positioning.address);
    await positioningConfig.setTwapInterval(28800);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
    await perpetualOracle.setIndexObservationAdder(owner.address);

    const depositAmount = BigNumber.from("1000000000000000000000");
    let baseAmount = "1000000000000000000"; //500
    let quoteAmount = "60000000000000000000"; //100

    // transfer balances
    await (await USDC.connect(owner).transfer(alice.address, depositAmount)).wait();
    await (await USDC.connect(owner).transfer(bob.address, depositAmount)).wait();

    // approve to vault
    await (await USDC.connect(owner).approve(volmexPerpPeriphery.address, depositAmount)).wait();
    await (await USDC.connect(alice).approve(volmexPerpPeriphery.address, depositAmount)).wait();
    await (await USDC.connect(bob).approve(volmexPerpPeriphery.address, depositAmount)).wait();
    await (await USDC.connect(alice).approve(vaultController.address, depositAmount)).wait();
    await (
      await vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, depositAmount)
    ).wait();
    // deposit to vault
    await (await volmexPerpPeriphery.depositToVault(0, USDC.address, depositAmount)).wait();
    // await (
    //   await volmexPerpPeriphery.connect(alice).depositToVault(0, USDC.address, depositAmount)
    // ).wait();
    await (
      await volmexPerpPeriphery.connect(bob).depositToVault(0, USDC.address, depositAmount)
    ).wait();

    await expect(volmexPerpPeriphery.whitelistTrader(alice.address, true)).to.emit(
      volmexPerpPeriphery,
      "TraderWhitelisted",
    );
    await expect(volmexPerpPeriphery.whitelistTrader(bob.address, true)).to.emit(
      volmexPerpPeriphery,
      "TraderWhitelisted",
    );
    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

    let salt = 2;
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
    await perpetualOracle.setMarkObservationAdder(owner.address);
  });

  describe("setter and getter", () => {
    it("Should set epoch interval", async () => {
      await perpetualOracle.grantSmaIntervalRole(owner.address);
      await (await perpetualOracle.setMarkSmInterval(14400)).wait();
      expect((await perpetualOracle.markSmInterval()).toString()).equal("14400");
    });

    it("Should get last mark price", async () => {
      expect((await perpetualOracle.latestMarkPrice(0)).toString()).equal("60000000");
    });

    it("Should get custom epoch price", async () => {
      expect(
        (
          await perpetualOracle.getMarkEpochSMA(
            0,
            parseInt(await time.latest()),
            parseInt(await time.latest()) + 28800,
          )
        ).toString(),
      ).equal("0");
    });

    it("Should try set sm interval", async () => {
      await expectRevert(
        perpetualOracle.setMarkSmInterval(14400),
        "MarkPriceOracle: not sma interval role",
      );
    });
  });

  describe("Deployment", function () {
    it("Should deploy successfully", async () => {
      let receipt = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [volmexBaseToken.address, volmexBaseToken.address],
          [60000000, 60000000],
          [60000000, 60000000],
          [proofHash, proofHash],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );
      expect(receipt.confirmations).not.equal(0);
    });
    it("Should fail to initialize again", async () => {
      let receipt = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [volmexBaseToken.address, volmexBaseToken.address],
          [10000000, 10000000],
          [10000000, 10000000],
          [proofHash, proofHash],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );
      expect(receipt.confirmations).not.equal(0);
      await expect(
        receipt.__PerpetualOracle_init(
          [volmexBaseToken.address, volmexBaseToken.address],
          [10000000, 10000000],
          [10000000, 10000000],
          [proofHash, proofHash],
          owner.address,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });

  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addMarkObservation(0, 60000000);
      }

      const txn = await perpetualOracle.lastestLastPriceSMA(0, 10000);
      expect(Number(txn)).equal(60000000);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(perpetualOracle.addMarkObservation(0, 0)).to.be.revertedWith(
        "PerpOracle: zero price",
      );
    });
    it("Should fail to add observation when caller is not exchange", async () => {
      await expect(
        perpetualOracle.connect(account1).addMarkObservation(1000000, 0),
      ).to.be.revertedWith("PerpOracle: not mark observation adder");
    });

    it("Should get cumulative price", async () => {
      await perpetualOracle.addMarkObservation(0, 60000000);

      const txn = await perpetualOracle.lastestLastPriceSMA(0, 10000);
      expect(Number(txn)).equal(60000000);
    });
    it("Should get last price ", async () => {
      await perpetualOracle.addMarkObservation(0, 1000000);

      const txn = await perpetualOracle.lastestLastPriceSMA(0, 1);
      expect(Number(txn)).equal(1000000);
    });
    it("should  give last epoch price", async () => {
      await time.increase(28800);
      for (let i = 0; i < 50; i++) {
        await time.increase(300);
        await perpetualOracle.addMarkObservation(0, 80000000);
      }
      const timestamp = await time.latest();
      const lastEpochPrice = await perpetualOracle.getMarkEpochSMA(
        0,
        parseInt(timestamp) - 28800,
        parseInt(timestamp),
      );
      expect(parseInt(lastEpochPrice)).to.be.equal(60000000);
    });

    it("Should get cumulative price with time delay", async () => {
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addMarkObservation(0, 60000000);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        perpetualOracle.lastestLastPriceSMA(0, 1000),
        perpetualOracle.lastestLastPriceSMA(0, 2000),
        perpetualOracle.lastestLastPriceSMA(0, 3000),
        perpetualOracle.lastestLastPriceSMA(0, 4000),
        perpetualOracle.lastestLastPriceSMA(0, 5000),
        perpetualOracle.lastestLastPriceSMA(0, 6000),
        perpetualOracle.lastestLastPriceSMA(0, 7000),
        perpetualOracle.lastestLastPriceSMA(0, 8000),
        perpetualOracle.lastestLastPriceSMA(0, 9000),
        perpetualOracle.lastestLastPriceSMA(0, 100000),
        perpetualOracle.lastestLastPriceSMA(0, 200000),
      ]);
      txns.forEach(txn => {
        expect(Number(txn)).equal(60000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await perpetualOracle.lastestLastPriceSMA(0, 20000);
      expect(Number(txn1)).equal(60000000);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addMarkObservation(0, 60000000);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await perpetualOracle.lastestLastPriceSMA(0, 100000);
      expect(Number(txn2)).equal(0);
      const txn3 = await perpetualOracle.lastestLastPriceSMA(0, 20000000);
      expect(Number(txn3)).equal(60000000);
    });

    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await perpetualOracle.lastestLastPriceSMA(0, 20000);
      expect(Number(txn1)).equal(60000000);

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addMarkObservation(0, 20000000);
        await time.increase(1000);
      }
      const txn2 = await perpetualOracle.lastestLastPriceSMA(0, 10000);
      expect(Number(txn2)).equal(20000000);
    });

    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).setMarkObservationAdder(matchingEngine.address),
      ).to.be.revertedWith("PerpOracle: not admin");
    });

    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(perpetualOracle.setMarkObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "PerpOracle: zero address",
      );
    });
    it("Should return values from last epoch ", async () => {
      await time.increase(28800);
      const firstTimestamp = await time.latest();
      for (let i = 0; i <= 20; i++) {
        await perpetualOracle.addMarkObservation(0, 70000000);
      }
      await time.increase(28800);
      const secondTimestamp = await time.latest();
      const cumulativePrice1 = await perpetualOracle.lastestLastPriceSMA(
        0,
        Number(secondTimestamp),
      );

      expect(parseInt(cumulativePrice1)).to.equal(70000000);
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
