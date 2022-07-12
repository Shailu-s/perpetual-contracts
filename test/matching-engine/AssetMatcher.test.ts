import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
const order = require('../order');

describe('AssetMatcher', function () {
  let signers: Signer[];
  let AssetMatcher;
  let assetMatcher;
  let VirtualToken;
  let virtualToken;

  this.beforeAll(async () => {
    signers = await ethers.getSigners();
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
    )
  });

  it ("AssetMatcher deployed confirm", async () => {
    let receipt = await assetMatcher.deployed();
    expect(receipt.confirmations).not.equal(0);

    receipt = await virtualToken.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  it ("Should call match asset", async () => {
    const tx = await assetMatcher.matchAssetsTest(
      order.Asset(virtualToken.address, "10"),
      order.Asset(virtualToken.address, "10"),
    );
    console.log(tx);
  });
});
