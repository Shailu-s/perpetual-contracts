import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { initial } from "lodash";

describe("ParentToken", function () {
  let VolmexBaseToken;
  let volmexBaseToken;
  let PerpetualOracle;
  let perpetualOracle;
  let owner, account1, account2;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  this.beforeAll(async () => {
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
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
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken.address],
        [200000000, 200000000],
        [200000000, 200000000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);
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
          [volmexBaseToken.address, volmexBaseToken.address],
          [200000000, 200000000],
          [200000000, 200000000],
          [proofHash, proofHash],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );

      expect(await volmexBaseToken.setPriceFeed(volmexPriceOracle.address))
        .to.emit(volmexBaseToken, "PriceFeedChanged")
        .withArgs(volmexPriceOracle.address);
      expect(await volmexBaseToken.getPriceFeed()).to.equal(volmexPriceOracle.address);
    });
    it("should set tw interval", async () => {
      await volmexBaseToken.setTwInterval(10000);
    });
    describe("Getters", function () {
      it("Should get index price", async () => {
        expect(await volmexBaseToken.getIndexPrice(0)).to.eq(10000000);
      });
    });
  });
});
