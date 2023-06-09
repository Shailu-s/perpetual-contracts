import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";
import { getCurrentTimestamp } from "../../coverage/temp/isolated-pools/scenario/src/Utils";
const { Order, Asset, sign, encodeAddress } = require("../order");
const { time } = require("@openzeppelin/test-helpers");
interface Observation {
  timestamp: number;
  price: number;
}

describe("Custom Cumulative Price", function () {
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
  let index;
  const observations = [];
  const deadline = 87654321987654;
  const interval = 28800;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
  let firstTimestamp;
  let secondTimestamp;
  let thirdTimestamp;
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
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
        [70000000, 70000000],
        [75000000, 75000000],
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

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken.address],
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
      [volmexBaseToken.address, volmexBaseToken.address],
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
        [volmexBaseToken.address, volmexBaseToken.address],
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
    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("1000000000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await perpetualOracle.setPositioning(positioning.address);
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.setTwapInterval(28800);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
    const depositAmount = BigNumber.from("1000000000000000000000");
    let baseAmount = "10000000000000000000"; //500
    let quoteAmount = "700000000000000000000"; //100

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
  describe("Custom window ", async () => {
    it("should return cumulative price between first time stamp and second and third", async () => {
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await perpetualOracle.addMarkObservation(0, 70000000);
        const { events } = await tx.wait();

        let data;
        events.forEach((log: any) => {
          if (log["event"] == "MarkObservationAdded") {
            data = log["data"];
          }
        });
        const logData = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data,
        );
        const observation: Observation = {
          timestamp: parseInt(logData[2]),
          price: parseInt(logData[0]),
        };
        observations.push(observation);
      }
      const cumulativePrice1 = await perpetualOracle.lastestLastPriceSMA(0, 28800);
      expect(parseInt(cumulativePrice1)).to.equal(70000000);
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await perpetualOracle.addMarkObservation(0, 75000000);
        const { events } = await tx.wait();
        let data;
        events.forEach((log: any) => {
          if (log["event"] == "MarkObservationAdded") {
            data = log["data"];
          }
        });
        const logData = ethers.utils.defaultAbiCoder.decode(
          ["uint256", "uint256", "uint256"],
          data,
        );
        const observation: Observation = {
          timestamp: parseInt(logData[2]),
          price: parseInt(logData[0]),
        };
        observations.push(observation);
      }
      const cumulativePrice2 = await perpetualOracle.lastestLastPriceSMA(0, 28800);
      expect(parseInt(cumulativePrice2)).to.equal(75000000);
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
