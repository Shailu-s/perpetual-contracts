import { expect, util } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { BigNumber } from "ethers";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { utils } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("PerpetualOracle - Index Price Oracle", function () {
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
    await perpetualOracle.setIndexObservationAdder(owner.address);
  });
  describe("Epoch", () => {
    it("Should calculate average price", async () => {
      await time.increase(epochTimeSeconds * 2);
      let sum = 0;
      let index;
      for (index = 0; index < 10; ++index) {
        await (
          await perpetualOracle.addIndexObservations(
            [0],
            [100000000 + index * 1000000],
            [proofHash],
          )
        ).wait();
        sum += 100000000 + index * 1000000;
      }
      const priceCumulative = sum / index;
      expect((await perpetualOracle.latestIndexSMA(28800, 0)).answer.toString()).equal(
        priceCumulative.toString(),
      );
    });
  });

  describe("Setters and getters", () => {
    it("Should fetch lastest index", async () => {
      await (await perpetualOracle.addIndexObservations([0], [76000000], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect((await perpetualOracle.latestIndexPrice(0)).toString()).equal("76000000");
    });
  });

  describe("Deployment", function () {
    it("Should deploy volmex oracle", async () => {
      const receipt = await perpetualOracle.deployed();
      expect(receipt.confirmations).not.equal(0);
    });

    it("Should fail to initialize again ", async () => {
      await expectRevert(
        perpetualOracle.__PerpetualOracle_init(
          [volmexBaseToken.address, volmexBaseToken.address],
          [60000000, 60000000],
          [60000000, 60000000],
          [proofHash, proofHash],
          owner.address,
        ),
        "Initializable: contract is already initialized",
      );
    });
  });
  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
      }

      const txn = await perpetualOracle.latestIndexSMA(10000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(perpetualOracle.addIndexObservations([0], [0], [proofHash])).to.be.revertedWith(
        "PerpOracle: zero price",
      );
    });
    it("Should fail to add observation when caller is not observation adder", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).addIndexObservations([1000000], [0], [proofHash]),
      ).to.be.revertedWith("PerpOracle: not index observation adder");
    });

    it("Should get cumulative price", async () => {
      await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);

      const txn = await perpetualOracle.latestIndexSMA(10000000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("Should latest round data", async () => {
      await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
      await time.increase(10000);

      const txn = await perpetualOracle.latestIndexSMA(10000, 0);
      expect(Number(txn.answer)).equal(10000000);
    });

    it("Should get cumulative price with time delay", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        perpetualOracle.latestIndexSMA(1000, 0),
        perpetualOracle.latestIndexSMA(2000, 0),
        perpetualOracle.latestIndexSMA(3000, 0),
        perpetualOracle.latestIndexSMA(4000, 0),
        perpetualOracle.latestIndexSMA(5000, 0),
        perpetualOracle.latestIndexSMA(6000, 0),
        perpetualOracle.latestIndexSMA(7000, 0),
        perpetualOracle.latestIndexSMA(8000, 0),
        perpetualOracle.latestIndexSMA(9000, 0),
        perpetualOracle.latestIndexSMA(10000, 0),
        perpetualOracle.latestIndexSMA(20000, 0),
      ]);
      txns.forEach(txn => {
        expect(Number(txn.answer)).equal(10000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await perpetualOracle.latestIndexSMA(20000, 0);
      expect(Number(txn1.answer)).equal(60000000);
      for (let i = 0; i < 9; i++) {
        await perpetualOracle.addIndexObservations([0], [10000000], [proofHash]);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await perpetualOracle.latestIndexSMA(200, 0);
      expect(Number(txn2.answer)).equal(0);
      const txn3 = await perpetualOracle.latestIndexSMA(200000, 0);
      expect(Number(txn3.answer)).equal(10000000);
    });

    it("should return 0 price when no epoch is added", async () => {
      const currentTimeStamp = parseInt(await time.latest());
      const price = await perpetualOracle.getIndexEpochSMA(
        0,
        currentTimeStamp,
        currentTimeStamp + 10000,
      );
      expect(price.toString()).to.be.equal("0");
    });
    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await perpetualOracle.latestIndexSMA(20, 0);
      expect(Number(txn1.answer)).equal(60000000);

      for (let i = 0; i < 10; i++) {
        await perpetualOracle.addIndexObservations([0], [20000000], [proofHash]);
        await time.increase(1000);
      }
      const txn2 = await perpetualOracle.latestIndexSMA(9000, 0);
      expect(Number(txn2.answer)).equal(20000000);
    });
    it("should revert when tw interval  is zero", async () => {
      const timestamp = parseInt(await time.latest());
      await expect(perpetualOracle.latestIndexSMA(0, 0)).to.be.revertedWith(
        "PerpOracle: invalid timestamp",
      );
    });
    it("should revert when endtime stamp < start  ", async () => {
      const timestamp = parseInt(await time.latest());
      await expect(
        perpetualOracle.getIndexEpochSMA(0, timestamp, timestamp - 7000),
      ).to.be.revertedWith("PerpOracle: invalid timestamp");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        perpetualOracle.connect(account1).setIndexObservationAdder(account1.address),
      ).to.be.revertedWith("PerpOracle: not admin");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(perpetualOracle.setIndexObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "PerpOracle: zero address",
      );
    });
  });
});
