const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
import { Signer } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("IndexPriceOracle", function () {
  let owner: string;
  let accounts: Signer[];
  let OracleFactory: any;
  let indexOracle: any;
  let BaseToken: any;
  let baseToken: any;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  this.beforeAll(async function () {
    accounts = await ethers.getSigners();
    BaseToken = await ethers.getContractFactory("VolmexBaseToken");
    OracleFactory = await ethers.getContractFactory("IndexPriceOracle");
  });

  this.beforeEach(async function () {
    owner = await accounts[0].getAddress();
    baseToken = await upgrades.deployProxy(BaseToken, ["BaseToken", "VBT", owner, true]);
    await baseToken.deployed();
    indexOracle = await upgrades.deployProxy(OracleFactory, [
      owner,
      [80000000],
      [baseToken.address],
      [proofHash],
      [capRatio],
    ]);
    await indexOracle.deployed();
    await (await indexOracle.setObservationAdder(owner)).wait();
    await (await indexOracle.grantInitialTimestampRole(owner)).wait();
    await (await indexOracle.setInitialTimestamp((await time.latest()).toString())).wait();
    await (await baseToken.setPriceFeed(indexOracle.address)).wait();
  });
  it("Should deploy index oracle", async () => {
    const receipt = await indexOracle.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  it("Should add one observation", async () => {
    let outer, inner;
    for (outer = 0; outer < 10; ++outer) {
      for (inner = 0; inner < 10; ++inner) {
        await (await indexOracle.addObservation([10000000 + inner * 1000000], [0], [proofHash])).wait();
      }
      console.log(`First Epoch: ${outer}`, (await indexOracle.getLastEpochPrice(0)).toString());
      const timestamp = Number((await time.latest()).toString()) - 28900;
      console.log(`First Custom Epoch: ${outer}`, (await indexOracle.getCustomEpochPrice(0, timestamp)).toString());
      time.increase(28810);
    }
  });
});
