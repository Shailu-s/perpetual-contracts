import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const order = require("../order");

describe("AssetMatcher", function () {
  let AssetMatcher;
  let assetMatcher;
  let VirtualToken;
  let virtualToken;
  let leftBaseToken: string;
  let rightBaseToken: string;

  this.beforeAll(async () => {
    AssetMatcher = await ethers.getContractFactory("AssetMatcherTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
  });

  beforeEach(async () => {
    assetMatcher = await upgrades.deployProxy(AssetMatcher, [], {
      initializer: "__AssetMatcherTest_init",
    });
    await assetMatcher.deployed();
    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", true], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    leftBaseToken = virtualToken.address;
    rightBaseToken = virtualToken.address;
  });

  describe("Deployment:", function () {
    it("AssetMatcher deployed confirm", async () => {
      let receipt = await assetMatcher.deployed();
      expect(receipt.confirmations).not.equal(0);

      receipt = await virtualToken.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe("Match asset:", function () {
    describe("Success:", function () {
      it("Should call match asset", async () => {
        const tx = await assetMatcher.matchAssetsTest(leftBaseToken, rightBaseToken);
      });

      it("Should call match asset with different left & right order values", async () => {
        const tx = await assetMatcher.matchAssetsTest(leftBaseToken, rightBaseToken);
      });
    });

    describe("Failure:", function () {
      it("Should fail to call match asset as left token address is 0", async () => {
        await expect(
          assetMatcher.matchAssetsTest(
            "0x0000000000000000000000000000000000000000",
            rightBaseToken,
          ),
        ).to.be.revertedWith("V_PERP_M: not found");
      });

      it("Should fail to call match asset as right token address is 0", async () => {
        await expect(
          assetMatcher.matchAssetsTest(
            leftBaseToken,
            "0x0000000000000000000000000000000000000000",
          ),
        ).to.be.revertedWith("V_PERP_M: not found");
      });
    });
  });
});
