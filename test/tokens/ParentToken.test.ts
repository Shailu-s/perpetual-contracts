import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("ParentToken", function () {
  let VolmexBaseToken;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let volmexBaseToken;
  let volmexBaseToken1;
  let volmexBaseToken2;
  let volmexBaseToken3;
  let PerpetualOracle;
  let perpetualOracle;
  let owner, account1, account2;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const capRatio = "250";
  this.beforeAll(async () => {
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
  });
  beforeEach(async () => {
    [owner, account1, account2] = await ethers.getSigners();

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      ["MyTestToken", "MKT", account1.address, true],
      {
        initializer: "initialize",
      },
    );
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          volmexBaseToken.address,
          volmexBaseToken.address,
          volmexBaseToken.address,
          volmexBaseToken.address,
        ],
        [100000000, 100000000, 30000000000, 1800000000],
        [100000000, 100000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
  });
  describe("deployment", function () {
    it("should fail to again", async () => {
      await expect(
        volmexBaseToken.initialize("MyTestToken", "MKT", perpetualOracle.address, true),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });
  describe("setter and getter methods", function () {
    it("Should set price feed", async () => {
      const volmexPriceOracle = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [
            volmexBaseToken.address,
            volmexBaseToken.address,
            volmexBaseToken.address,
            volmexBaseToken.address,
          ],
          [100000000, 100000000, 30000000000, 1800000000],
          [100000000, 100000000],
          [proofHash, proofHash],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [chainlinkAggregator1.address, chainlinkAggregator2.address],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );

      expect(await volmexBaseToken.setPriceFeed(volmexPriceOracle.address))
        .to.emit(volmexBaseToken, "PriceFeedChanged")
        .withArgs(volmexPriceOracle.address);
      expect(await volmexBaseToken.getPriceFeed()).to.equal(volmexPriceOracle.address);
    });

    describe("Getters", function () {
      it("Should get index price", async () => {
        expect(await volmexBaseToken.getIndexPrice(0, 3600)).to.eq(200000000);
      });
    });
  });
});
