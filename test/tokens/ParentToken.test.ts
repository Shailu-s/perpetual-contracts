import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { initial } from "lodash";

describe("ParentToken", function () {
  let VolmexBaseToken;
  let volmexBaseToken;
  let IndexPriceOracle;
  let indexPriceOracle;
  let owner, account1, account2;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  this.beforeAll(async () => {
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
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
    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
  });
  describe("deployment", function () {
    it("should fail to again", async () => {
      await expect(
        volmexBaseToken.initialize("MyTestToken", "MKT", indexPriceOracle.address, true),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });
  describe("setter and getter methods", function () {
    it("Should set price feed", async () => {
      const volmexPriceOracle = await upgrades.deployProxy(
        IndexPriceOracle,
        [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
        {
          initializer: "initialize",
        },
      );
      expect(await volmexBaseToken.setPriceFeed(volmexPriceOracle.address))
        .to.emit(volmexBaseToken, "PriceFeedChanged")
        .withArgs(volmexPriceOracle.address);
      expect(await volmexBaseToken.getPriceFeed()).to.equal(volmexPriceOracle.address);
    });
    describe("Getters", function () {
      it("Should get index price", async () => {
        expect(await volmexBaseToken.getIndexPrice(0)).to.eq(10000000);
      });
    });
  });
});
