import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("ERC20TransferProxy", function () {
  let TransferProxy;
  let transferProxy;
  let TestERC20;
  let USDC;
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  let owner, account1, account2;
  this.beforeAll(async () => {
    [owner, account1, account2] = await ethers.getSigners();
    TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
    TestERC20 = await ethers.getContractFactory("TestERC20");
  });
  beforeEach(async () => {
    transferProxy = await upgrades.deployProxy(TransferProxy, [], {
      initializer: "erc20TransferProxyInit",
    });
    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();
  });
  describe("Deployment", function () {
    it("it should deploy successfully", async () => {
      let receipt = await upgrades.deployProxy(TransferProxy, [], {
        initializer: "erc20TransferProxyInit",
      });
      expect(receipt.confirmations).not.equal(0);
    });
    it("should be able to set caller of tranfer function", async () => {
      await transferProxy.addTransferProxyRole(account1.address);
      expect(transferProxy.TRANSFER_PROXY_CALLER()).not.equal(0);
    });
  });
  describe("Transfer From", function () {
    it("Shoud Tranfer tokens using tranfer from method", async () => {
      await USDC.mint(account1.address, 10000000);
      await USDC.connect(account1).approve(transferProxy.address, 10000000);
      await transferProxy.addTransferProxyRole(owner.address);
      await transferProxy.erc20SafeTransferFrom(
        USDC.address,
        account1.address,
        account2.address,
        500000,
      );
      expect(await USDC.balanceOf(account2.address)).to.be.equal(500000);
    });
    it("Shoud fail to Tranfer tokens using tranfer from method", async () => {
      await USDC.mint(account1.address, 10000000);
      await USDC.connect(account1).approve(transferProxy.address, 10000000);
      await transferProxy.addTransferProxyRole(owner.address);
      await expect(
        transferProxy
          .connect(account1)
          .erc20SafeTransferFrom(USDC.address, account1.address, account2.address, 500000),
      ).to.be.revertedWith("Positioning: Not admin");
    });
  });
});
