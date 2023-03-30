import { expect, util } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { utils } from "ethers";
import { getCurrentTimestamp } from "../../coverage/temp/isolated-pools/scenario/src/Utils";
const { expectRevert, time } = require("@openzeppelin/test-helpers");
interface Observation {
  timestamp: number;
  price: number;
}
const getCustomCumulativePrice = (
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

describe("MarkPriceOracle", function () {
  let MarkPriceOracle;
  let markPriceOracle;
  let ExchangeTest;
  let exchangeTest;
  let factory;
  let PerpFactory;
  let volmexBaseToken;
  let newToken;
  let VolmexBaseToken;
  let indexPriceOracle;
  let IndexPriceOracle;
  let MatchingEngine;
  let matchingEngine;
  let erc20TransferProxy;
  let ERC20TransferProxyTest;
  let community;
  let VaultController;
  let vaultController;
  let Vault;
  let vault;
  let Positioning;
  let positioning;
  let AccountBalance;
  let accountBalance;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let MarketRegistry;
  let marketRegistry;
  let owner;
  let account1;
  let account2;
  let account3;
  let account4;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const observations = [];
  let index: number;
  const interval = 28800;
  let firstTimestamp;
  let secondTimestamp;
  let thirdTimestamp;
  this.beforeAll(async () => {
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    ExchangeTest = await ethers.getContractFactory("ExchangeTest");
    PerpFactory = await ethers.getContractFactory("PerpFactory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    VaultController = await ethers.getContractFactory("VaultController");
    Vault = await ethers.getContractFactory("Vault");
    Positioning = await ethers.getContractFactory("Positioning");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  });

  beforeEach(async () => {
    [owner, account1, account2, account3, account4] = await ethers.getSigners();

    exchangeTest = await ExchangeTest.deploy();
    perpViewFake = await smock.fake("VolmexPerpView");

    erc20TransferProxy = await ERC20TransferProxyTest.deploy();
    community = account4.address;

    volmexBaseToken = await upgrades.deployProxy(VolmexBaseToken, [
      "MyTestToken",
      "MKT",
      account1.address,
      true,
    ]);
    await volmexBaseToken.deployed();

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[1000000], [volmexBaseToken.address], [proofHash], [capRatio], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await matchingEngine.deployed();

    await markPriceOracle.connect(owner).setObservationAdder(matchingEngine.address);
  });
  describe("Custom window ", async () => {
    it("should return cumulative price between first time stamp and second and third", async () => {
      firstTimestamp = getCurrentTimestamp();
      secondTimestamp = firstTimestamp + interval;
      thirdTimestamp = secondTimestamp + interval;
      await markPriceOracle.setObservationAdder(owner.address);
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
          price: parseInt(logData[1]),
        };
        observations.push(observation);
      }
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await markPriceOracle.addObservation(75000000, 0, proofHash);
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
          price: parseInt(logData[1]),
        };
        observations.push(observation);
      }
      for (index = 0; index < 96; index++) {
        // add obeservation in every 5 minutes
        await time.increase(300);
        const tx = await markPriceOracle.addObservation(80000000, 0, proofHash);
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
          price: parseInt(logData[1]),
        };
        observations.push(observation);
      }
      console.log(firstTimestamp);
      const cumulativePrice1 = await markPriceOracle.getCustomCumulativePrice(
        0,
        firstTimestamp + 300,
        secondTimestamp,
      );
      const price = getCustomCumulativePrice(observations, firstTimestamp, secondTimestamp);
      expect(parseInt(cumulativePrice1)).to.equal(price);
      const cumulativePrice2 = await markPriceOracle.getCustomCumulativePrice(
        0,
        secondTimestamp + 300,
        thirdTimestamp,
      );
      const price1 = getCustomCumulativePrice(observations, secondTimestamp + 300, thirdTimestamp);
      expect(parseInt(cumulativePrice2)).to.equal(price1);
      const cumulativePrice3 = await markPriceOracle.getCustomCumulativePrice(
        0,
        thirdTimestamp + 300,
        thirdTimestamp + 28800,
      );
      const price2 = getCustomCumulativePrice(
        observations,
        thirdTimestamp + 300,
        thirdTimestamp + 28800,
      );
      expect(parseInt(cumulativePrice3)).to.equal(price2);
    });
  });
});
