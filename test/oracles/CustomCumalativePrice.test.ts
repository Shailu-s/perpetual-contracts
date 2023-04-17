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
const getCustomUnderlyingSma = (
  observations: Array<Observation>,
  startTime: number,
  endTime: number,
) => {
  let priceCumulative = 0;
  let index = observations.length;
  let startIndex = 0;
  let endIndex = 0;
  for (; index != 0 && index >= startIndex; index--) {
    if (observations[index - 1].timestamp >= endTime) {
      endIndex = index - 1;
    } else if (observations[index - 1].timestamp >= startTime) {
      startIndex = index - 1;
    }
  }
  index = 0; // re-used to get total observation count
  for (; startIndex <= endIndex; startIndex++) {
    priceCumulative += observations[startIndex].price;
    index++;
  }
  priceCumulative = priceCumulative / index;
  return priceCumulative;
};

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

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [75000000], [volmexBaseToken.address], [proofHash], [capRatio]],
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
      [[70000000], [volmexBaseToken.address], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    await (await indexPriceOracle.grantInitialTimestampRole(markPriceOracle.address)).wait();
    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address]);
    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      markPriceOracle.address,
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

    await markPriceOracle.deployed();
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
    await markPriceOracle.grantSmaIntervalRole(positioningConfig.address);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("1000000000000000000000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await markPriceOracle.setPositioning(positioning.address);
    await markPriceOracle.setIndexOracle(indexPriceOracle.address);
    await positioningConfig.setTwapInterval(28800);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
    const depositAmount = BigNumber.from("1000000000000000000000");
    let baseAmount = "1000000000000000000"; //500
    let quoteAmount = "70000000000000000000"; //100

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
    await markPriceOracle.setObservationAdder(matchingEngine.address);

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
    await markPriceOracle.setObservationAdder(owner.address);
  });
  describe("Custom window ", async () => {
    this.beforeEach(async () => {
      const blockNumBefore = await ethers.provider.getBlockNumber();
      const blockBefore = await ethers.provider.getBlock(blockNumBefore);
      const timestampBefore = blockBefore.timestamp;
      firstTimestamp = timestampBefore;
      secondTimestamp = firstTimestamp + interval;
      thirdTimestamp = secondTimestamp + interval;
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await markPriceOracle.addObservation(70000000, 0, proofHash);
        const { events } = await tx.wait();

        let data;
        events.forEach((log: any) => {
          if (log["event"] == "ObservationAdded") {
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
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await markPriceOracle.addObservation(75000000, 0);
        const { events } = await tx.wait();
        let data;
        events.forEach((log: any) => {
          if (log["event"] == "ObservationAdded") {
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
    });
    it("should return cumulative price between first time stamp and second and third", async () => {
      const cumulativePrice1 = await markPriceOracle.getCustomUnderlyingSma(
        0,
        firstTimestamp + 300,
        secondTimestamp,
      );
      const price = getCustomUnderlyingSma(observations, firstTimestamp, secondTimestamp);
      expect(parseInt(cumulativePrice1)).to.equal(price);
      const cumulativePrice2 = await markPriceOracle.getCustomUnderlyingSma(
        0,
        secondTimestamp + 300,
        thirdTimestamp,
      );
      const price1 = getCustomUnderlyingSma(observations, secondTimestamp + 300, thirdTimestamp);
      expect(parseInt(cumulativePrice2)).to.equal(price1);
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
