import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
const order = require('../order');

describe('AssetMatcher', function () {
  let AssetMatcher;
  let assetMatcher;
  let VirtualToken;
  let virtualToken;
  let leftAsset;
  let rightAsset;

  this.beforeAll(async () => {
    AssetMatcher = await ethers.getContractFactory("AssetMatcherTest");
    VirtualToken = await ethers.getContractFactory("VirtualToken");
  });

  beforeEach(async () => {
    assetMatcher = await upgrades.deployProxy(
      AssetMatcher,
      [],
      {
        initializer: "__AssetMatcherTest_init"
      }
    );
    virtualToken = await upgrades.deployProxy(
      VirtualToken,
      ["Virtual Ethereum", "VETH"],
      {
        initializer: "__VirtualToken_init"
      }
    );
    leftAsset = order.Asset(virtualToken.address, "10");
    rightAsset = order.Asset(virtualToken.address, "20");
  });

  describe('Deployment:', function() {
    it ("AssetMatcher deployed confirm", async () => {
      let receipt = await assetMatcher.deployed();
      expect(receipt.confirmations).not.equal(0);

      receipt = await virtualToken.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe('Match asset:', function() {
    describe('Success:', function() {
      it ("Should call match asset", async () => {
        const tx = await assetMatcher.matchAssetsTest(
          leftAsset,
          leftAsset,
        );
      });

      it("Should call match asset with different left & right order values", async () => {
        const tx = await assetMatcher.matchAssetsTest(
          leftAsset,
          rightAsset,
        );
      });
    });

    describe('Failure:', function() {
      it("Should fail to call match asset as left token address is 0", async () => {
        await expect(
          assetMatcher.matchAssetsTest(
            order.Asset('0x0000000000000000000000000000000000000000', "10"), 
            leftAsset,
          )
        ).to.be.revertedWith("not found IAssetMatcher");
      });
    
      it("Should fail to call match asset as right token address is 0", async () => {
        await expect(
          assetMatcher.matchAssetsTest(
            leftAsset, 
            order.Asset('0x0000000000000000000000000000000000000000', "10"),
          )
        ).to.be.revertedWith("not found IAssetMatcher");
      });
    });
  });
});
