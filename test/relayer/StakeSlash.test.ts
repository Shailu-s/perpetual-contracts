import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const BN = ethers.BigNumber;

describe("Stake & Slash", function () {
  let volmexSafe: Signer;
  let owner: Signer;
  let alice: Signer;
  let bob: Signer;
  let chris: Signer;
  let Multisig,
    Slashing,
    StakeToken,
    InsuranceFund,
    relayerSafe,
    slashing,
    stakeToken,
    insuranceFund;

  this.beforeAll(async () => {
    [owner, alice, bob, chris, volmexSafe] = await ethers.getSigners();
    StakeToken = await ethers.getContractFactory("TestERC20");
    Slashing = await ethers.getContractFactory("Slashing");
    Multisig = await ethers.getContractFactory("Safe");
    InsuranceFund = await ethers.getContractFactory("InsuranceFund");
  });
  this.beforeEach(async () => {
    stakeToken = await upgrades.deployProxy(StakeToken, ["Volmex Staked", "VSTKN", 6], {
      initializer: "__TestERC20_init",
    });
    await stakeToken.deployed();
    relayerSafe = await Multisig.deploy();
    await relayerSafe.deployed();
    insuranceFund = await upgrades.deployProxy(InsuranceFund, [stakeToken.address]);
    await insuranceFund.deployed();
    slashing = await upgrades.deployProxy(Slashing, [
      stakeToken.address,
      relayerSafe.address,
      await volmexSafe.getAddress(),
      await volmexSafe.getAddress(),
      432000, // 5 days
      insuranceFund.address,
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
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseUnits("10000", 6))).wait();
    });

    it("Should stake", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6))
      ).wait();
      const staker = await slashing.staker(aliceAddress);
      expect(staker.activeBalance).equal(ethers.utils.parseUnits("10000", 6));
    });

    it("Should not stake, not relayer", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6)),
      ).revertedWith("Staking: not relayer");
    });

    it("Should not stake, staking not live", async () => {
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6)),
      ).revertedWith("Staking: not live");
    });

    it("Should not stake, min required amount not fulfill", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("1000", 6))
      ).wait();
      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("1000", 6)),
      ).revertedWith("Staking: insufficient amount");
    });
  });

  describe("Unstake", function () {
    let aliceAddress: string;
    this.beforeEach(async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseUnits("20000", 6))).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("20000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("20000", 6))
      ).wait();
    });

    it("Should unstake", async () => {
      await (await slashing.connect(alice).cooldown(ethers.utils.parseUnits("1000", 6))).wait();
      const current = await time.latest();
      await time.increaseTo(current + 432000 + 1);
      const staker = await slashing.staker(aliceAddress);
      await (await slashing.connect(alice).unstake(aliceAddress)).wait();
      expect(staker.inactiveBalance).equal(ethers.utils.parseUnits("1000", 6));
    });

    it("Should not unstake, if cooldown not reached", async () => {
      await (await slashing.connect(alice).cooldown(ethers.utils.parseUnits("1000", 6))).wait();
      await expect(slashing.connect(alice).unstake(aliceAddress)).revertedWith(
        "Staking: insufficient cooldown",
      );
    });

    it("Should not unstake, if not cooldown", async () => {
      await expect(slashing.connect(alice).unstake(aliceAddress)).revertedWith(
        "Staking: insufficient inactive balance",
      );
    });
  });

  describe("Slashing", async () => {
    let aliceAddress: string;
    this.beforeEach(async () => {
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseUnits("10000", 6))).wait();
    });

    it("Should be slashed", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6))
      ).wait();
      const beforeSlash = await slashing.staker(aliceAddress);
      await (await slashing.connect(volmexSafe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);
      expect(beforeSlash.activeBalance.sub(afterSlash.activeBalance)).equal(
        ethers.utils.parseUnits("2500", 6),
      );
    });

    it("Should be slashed from both balances", async () => {
      await (await slashing.connect(volmexSafe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (await slashing.connect(alice).cooldown(ethers.utils.parseUnits("1000", 6))).wait();
      const beforeSlash = await slashing.staker(aliceAddress);
      await (await slashing.connect(volmexSafe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);
      expect(afterSlash.inactiveBalance).equal(0);
      expect(afterSlash.activeBalance).equal(
        beforeSlash.activeBalance.sub(
          ethers.utils.parseUnits("2500", 6).sub(beforeSlash.inactiveBalance),
        ),
      );
    });
  });
});
