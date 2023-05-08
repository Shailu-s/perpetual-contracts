import { expect, util } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { utils } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("IndexPriceOracle", function () {
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
  const epochTimeSeconds = 28800;
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
  });
  describe("Epoch", () => {
    it("Should calculate epoch of one price", async () => {
      await time.increase(epochTimeSeconds * 2);
      await (await perpetualOracle.addObservation(["76000000"], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect((await perpetualOracle.getLastEpochPrice(0))[0].toString()).equal("76000000");
    });

    it("Should calculate epoch of average values in that epoch", async () => {
      await time.increase(epochTimeSeconds * 2);
      let sum = 0;
      let index;
      for (index = 0; index < 10; ++index) {
        await (
          await perpetualOracle.addIndexObservation(
            [0],
            [100000000 + index * 1000000],
            [proofHash],
          )
        ).wait();
        sum += 100000000 + index * 1000000;
      }
      const priceCumulative = sum / index;
      expect(
        await perpetualOracle.getIndexEpochPrice(
          0,
          parseInt(await time.increase(epochTimeSeconds * 2)),
          parseInt(await time.increase(epochTimeSeconds * 2)) + 28800,
        ),
      ).equal(priceCumulative.toString());
    });

    it("Should skip an epoch and fills the epoch correctly", async () => {
      await time.increase(epochTimeSeconds * 2);
      await (await perpetualOracle.addObservation([76000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds * 2);
      await (await perpetualOracle.addObservation([86000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      const indexLength = await perpetualOracle.getIndexPriceByEpoch(0);
      expect((await perpetualOracle.getLastEpochPrice(0))[0].toString()).equal("86000000");
      expect(indexLength.toString()).equal("2");
    });
  });

  describe("Setters and getters", () => {
    it("Should set index sm interval", async () => {
      const receipt = await (await perpetualOracle.setIndexSmInterval(14400)).wait();
      expect(receipt.confirmations).not.equal(0);
      expect((await perpetualOracle.indexSmInterval()).toString()).equal("14400");
    });

    it("Should fetch custom epoch price", async () => {
      await time.increase(epochTimeSeconds * 2);
      await (await perpetualOracle.addObservation([76000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect(
        (
          await perpetualOracle.getCustomEpochPrice(0, (await time.latest()).toString())
        )[0].toString(),
      ).equal("76000000");
    });

    it("Should fetch last sma", async () => {
      await (await perpetualOracle.addObservation([76000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect((await perpetualOracle.getLastSma(28801, 0)).toString()).equal("76000000");
    });

    it("Should get current added indices", async () => {
      expect((await perpetualOracle.getIndexCount()).toString()).equal("1");
    });

    it("Should get last updated timestamp", async () => {
      await (await perpetualOracle.addObservation([76000000], [0], [proofHash])).wait();
      expect((await perpetualOracle.getLastUpdatedTimestamp(0)).toString()).equal(
        (await time.latest()).toString(),
      );
    });

    it("Should get total observations added", async () => {
      expect((await perpetualOracle.getIndexObservation(0)).toString()).equal("1");
    });

    it("Should return zero when no epoch is added", async () => {
      expect((await perpetualOracle.getLastEpochPrice(0))[0].toString()).equal("0");
    });

    it("Should revert for non role call of initial timestamp", async () => {
      await expectRevert(
        perpetualOracle.connect(account1).setInitialTimestamp((await time.latest()).toString()),
        "IndexPriceOracle: not first interval adder",
      );
    });
  });

  describe("Deployment", function () {
    it("Should deploy volmex oracle", async () => {
      const receipt = await perpetualOracle.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("Should fail to deploy if length of arrays is unequal", async () => {
      await expect(
        upgrades.deployProxy(
          PerpetualOracle,
          [owner, [10000000, 100000000], [volmexBaseToken.address], [proofHash], [capRatio]],
          {
            initializer: "initialize",
          },
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to deploy when asset address is 0", async () => {
      await expect(
        upgrades.deployProxy(
          PerpetualOracle,
          [
            owner,
            [10000000],
            ["0x0000000000000000000000000000000000000000"],
            [proofHash],
            [capRatio],
          ],
          {
            initializer: "initialize",
          },
        ),
      ).to.be.revertedWith("IndexPriceOracle: Asset address can't be 0");
    });

    it("Should fail to initialize again ", async () => {
      await expectRevert(
        perpetualOracle.initialize(
          owner,
          [100000],
          [volmexBaseToken.address],
          [proofHash],
          [capRatio],
        ),
        "Initializable: contract is already initialized",
      );
    });
  });
  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addObservation([10000000], [0], [proofHash]);
      }

      const txn = await perpetualOracle.getIndexSma(10000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(15909090);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(perpetualOracle.addObservation([0], [0], [proofHash])).to.be.revertedWith(
        "IndexPriceOracle: Not zero",
      );
    });
    it("Should fail to add observation when caller is not observation adder", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).addObservation([1000000], [0], [proofHash]),
      ).to.be.revertedWith("IndexPriceOracle: not observation adder");
    });

    it("Should get cumulative price", async () => {
      await perpetualOracle.addObservation([10000000], [0], [proofHash]);

      const txn = await perpetualOracle.getIndexSma(10000000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(42500000);
    });
    it("should return true for support interface", async () => {
      const result = await perpetualOracle.supportsInterface("0x01ffc9a7");
    });
    it("Should latest round data", async () => {
      await perpetualOracle.addObservation([10000000], [0], [proofHash]);
      await time.increase(10000);

      const txn = await perpetualOracle.latestRoundData(10000, 0);
      expect(Number(txn.answer)).equal(1000000000);
    });
    it("should  give last epoch price", async () => {
      await time.increase(28800 * 2);

      for (let i = 0; i < 50; i++) {
        await perpetualOracle.addObservation([800000000], [0], [proofHash]);
      }

      const lastEpochPrice = (await perpetualOracle.getLastEpochPrice(0))[0];
      expect(lastEpochPrice.toString()).to.be.equal("800000000");
    });

    it("should  give average price last epoch price", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 5; i++) {
        await perpetualOracle.addObservation([800000000], [0], [proofHash]);
      }
      for (let i = 0; i < 5; i++) {
        await perpetualOracle.addObservation([900000000], [0], [proofHash]);
      }

      const lastEpochPrice = await perpetualOracle.getLastEpochPrice(0);
      expect(parseInt(lastEpochPrice)).to.be.equal(849999998);
    });

    it("Should get cumulative price with time delay", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        perpetualOracle.getIndexSma(1000, 0),
        perpetualOracle.getIndexSma(2000, 0),
        perpetualOracle.getIndexSma(3000, 0),
        perpetualOracle.getIndexSma(4000, 0),
        perpetualOracle.getIndexSma(5000, 0),
        perpetualOracle.getIndexSma(6000, 0),
        perpetualOracle.getIndexSma(7000, 0),
        perpetualOracle.getIndexSma(8000, 0),
        perpetualOracle.getIndexSma(9000, 0),
        perpetualOracle.getIndexSma(10000, 0),
        perpetualOracle.getIndexSma(20000, 0),
      ]);
      txns.forEach(txn => {
        expect(Number(txn.volatilityTokenSma)).equal(10000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await perpetualOracle.getIndexSma(20000, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(75000000);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await perpetualOracle.getIndexSma(200, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(16500000);
      const txn3 = await perpetualOracle.getIndexSma(200000, 0);
      expect(Number(txn3.volatilityTokenSma)).equal(16500000);
    });

    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await perpetualOracle.getIndexSma(20, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(75000000);

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addObservation([20000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txn2 = await perpetualOracle.getIndexSma(9000, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(20000000);
    });

    it("Should fail to  add multiple observations because uneuqal length of inputs", async () => {
      await expect(
        perpetualOracle.addAssets(
          [10000000, 20000000],
          [baseToken.address],
          [proofHash],
          [capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to  add multiple observations because 0 address of a token", async () => {
      await expect(
        perpetualOracle.addAssets(
          [10000000, 20000000],
          [baseToken.address, ZERO_ADDR],
          [proofHash, proofHash],
          [capRatio, capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Asset address can't be 0");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).setObservationAdder(account1.address),
      ).to.be.revertedWith("IndexPriceOracle: not admin");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(perpetualOracle.setObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "IndexPriceOracle: zero address",
      );
    });
  });
});
