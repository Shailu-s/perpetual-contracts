import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Stake & Slash", function () {
  let volmexSafe: Signer;
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let chris: Signer;
  let insuranceFund: Signer;
  let Multisig, Slashing, StakeToken, relayerSafe, slashing, stakeToken;

  this.beforeAll(async () => {
    [owner, alice, bob, chris, volmexSafe, insuranceFund] = await ethers.getSigners();
    StakeToken = await ethers.getContractFactory("TestERC20");
    Slashing = await ethers.getContractFactory("Slashing");
    Multisig = await ethers.getContractFactory("Safe");
  });
  this.beforeEach(async () => {
    stakeToken = await upgrades.deployProxy(StakeToken, ["Volmex Staked", "VSTKN", 18], {
      initializer: "__TestERC20_init",
    });
    await stakeToken.deployed();
    relayerSafe = await Multisig.deploy();
    await relayerSafe.deployed();
    slashing = await upgrades.deployProxy(Slashing, [
      stakeToken.address,
      relayerSafe.address,
      await volmexSafe.getAddress(),
      432000, // 5 days
      86400, // 24 hours
      await insuranceFund.getAddress(),
    ]);
    await slashing.deployed();
  });

  it("Should deploy Slashing", async () => {
    const receipt = await slashing.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  describe("Staking", function () {
    let aliceAddress: string;
    this.beforeEach(async () => {
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseEther("10000"))).wait();
    });

    it("Should stake", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("10000"))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("10000"))
      ).wait();
      expect(await slashing.stakersAmount(aliceAddress)).equal(ethers.utils.parseEther("10000"));
    });

    it("Should not stake, not relayer", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("10000"))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("10000")),
      ).revertedWith("Staking: not signer");
    });

    it("Should not stake, staking not live", async () => {
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("10000"))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("10000")),
      ).revertedWith("Staking: staking not live");
    });

    it("Should not stake, min required amount not fulfill", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("1000"))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("1000")),
      ).revertedWith("Staking: insufficient amount");
    });
  });

  describe("Unstake", function () {
    let aliceAddress: string;
    this.beforeEach(async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseEther("20000"))).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("20000"))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("20000"))
      ).wait();
    });

    it("Should unstake", async () => {
      await (await slashing.connect(alice).cooldown()).wait();
      const current = await time.latest();
      await time.increaseTo(current + 432000 + 1);
      await (await slashing.connect(alice).unstake(aliceAddress, ethers.utils.parseEther("10000"))).wait();;
      expect(await slashing.stakersAmount(aliceAddress)).equal(ethers.utils.parseEther("10000"))
    });

    it("Should not unstake, if cooldown not reached", async () => {
      await (await slashing.connect(alice).cooldown()).wait();
      await expect(
        slashing.connect(alice).unstake(aliceAddress, ethers.utils.parseEther("10000")),
      ).revertedWith("Staking: insufficient cooldown");
    });

    it("Should not unstake, if unstake window closed", async () => {
      await (await slashing.connect(alice).cooldown()).wait();
      const current = await time.latest();
      await time.increaseTo(current + 432000 + 86400 + 1);
      await expect(
        slashing.connect(alice).unstake(aliceAddress, ethers.utils.parseEther("10000")),
      ).revertedWith("Staking: unstake window finished");
    });
  });

  describe("Slashing", async () => {
    let aliceAddress: string;
    this.beforeEach(async () => {
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseEther("10000"))).wait();
    });

    it("Should be slashed", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken.connect(alice).approve(slashing.address, ethers.utils.parseEther("10000"))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseEther("10000"))
      ).wait();
      await (await slashing.connect(volmexSafe).updateRelayerSafe(await owner.getAddress())).wait();
      const beforeStake = await slashing.stakersAmount(aliceAddress);
      await (await slashing.slash(aliceAddress)).wait();
      const afterStake = await slashing.stakersAmount(aliceAddress);
      expect(beforeStake.sub(afterStake)).equal(ethers.utils.parseEther("2500"));
    })
  })
});
