import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const { expectRevert } = require("@openzeppelin/test-helpers");
const BN = ethers.BigNumber;

describe("Stake & Slash", function () {
  let Safe: Signer;
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
    [owner, alice, bob, chris, Safe] = await ethers.getSigners();
    StakeToken = await ethers.getContractFactory("TestERC20");
    Slashing = await ethers.getContractFactory("Slashing");
    Multisig = await ethers.getContractFactory("Safe");
    InsuranceFund = await ethers.getContractFactory("InsuranceFund");
  });
  this.beforeEach(async () => {
    stakeToken = await upgrades.deployProxy(StakeToken, [" Staked", "VSTKN", 6], {
      initializer: "__TestERC20_init",
    });
    await stakeToken.deployed();
    relayerSafe = await Multisig.deploy();
    await relayerSafe.deployed();
    insuranceFund = await upgrades.deployProxy(InsuranceFund, [stakeToken.address]);
    await insuranceFund.deployed();
    slashing = await upgrades.deployProxy(
      Slashing,
      [
        stakeToken.address,
        relayerSafe.address,
        await Safe.getAddress(),
        await Safe.getAddress(),
        432000, // 5 days
        insuranceFund.address,
      ],
      {
        initializer: "Slashing_init",
      },
    );
    await slashing.deployed();
  });

  it("Should deploy Slashing", async () => {
    const receipt = await slashing.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  it("Should set slashing receiver ", async () => {
    const aliceAddress = await alice.getAddress();
    await slashing.connect(Safe).setSlashingReceiver(aliceAddress);
    expect(await slashing.slashingReceiver()).to.be.equal(aliceAddress);
  });
  describe("Staking", function () {
    let aliceAddress: string;
    this.beforeEach(async () => {
      aliceAddress = await alice.getAddress();
      await (await stakeToken.transfer(aliceAddress, ethers.utils.parseUnits("10000", 6))).wait();
    });

    it("Should stake", async () => {
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
    it("should not stake when re entered", async () => {
      const StakeToken = await ethers.getContractFactory("SlashERC20");
      const Slashing = await ethers.getContractFactory("Slashing");
      const Multisig = await ethers.getContractFactory("Safe");
      const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
      const stakeToken = await upgrades.deployProxy(StakeToken, [" Staked", "VSTKN", 6], {
        initializer: "__TestERC20_init",
      });
      const relayerSafe = await Multisig.deploy();
      await relayerSafe.deployed();
      const insuranceFund = await upgrades.deployProxy(InsuranceFund, [stakeToken.address]);
      await insuranceFund.deployed();
      const slashing = await upgrades.deployProxy(
        Slashing,
        [
          stakeToken.address,
          relayerSafe.address,
          await Safe.getAddress(),
          await Safe.getAddress(),
          432000, // 5 days
          insuranceFund.address,
        ],
        {
          initializer: "Slashing_init",
        },
      );
      await slashing.deployed();
      await (await slashing.connect(Safe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();

      await expect(
        slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6)),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Should not stake, not relayer", async () => {
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
    it("should not unstake", async () => {
      const [owner, alice, bob, chris, Safe] = await ethers.getSigners();
      const ownerAddress = await owner.getAddress();
      const StakeToken = await ethers.getContractFactory("UnStakeERC20");
      const Slashing = await ethers.getContractFactory("Slashing");
      const Multisig = await ethers.getContractFactory("Safe");
      const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
      const stakeToken = await upgrades.deployProxy(StakeToken, [" Staked", "VSTKN", 6], {
        initializer: "__TestERC20_init",
      });
      await stakeToken.mint(ownerAddress, "10000000000000000");
      const relayerSafe = await Multisig.deploy();
      await relayerSafe.deployed();
      const insuranceFund = await upgrades.deployProxy(InsuranceFund, [stakeToken.address]);
      await insuranceFund.deployed();
      const slashing = await upgrades.deployProxy(
        Slashing,
        [
          stakeToken.address,
          relayerSafe.address,
          await Safe.getAddress(),
          await Safe.getAddress(),
          432000, // 5 days
          insuranceFund.address,
        ],
        {
          initializer: "Slashing_init",
        },
      );
      await slashing.deployed();
      await (await slashing.connect(Safe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(ownerAddress)).wait();
      await (
        await stakeToken
          .connect(owner)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();

      await slashing.connect(owner).stake(ownerAddress, ethers.utils.parseUnits("10000", 6)),
        await (await slashing.connect(owner).cooldown(ethers.utils.parseUnits("1000", 6))).wait();
      const current = await time.latest();
      await time.increaseTo(current + 432000 + 1);
      const staker = await slashing.staker(ownerAddress);
      await expect(slashing.connect(owner).unstake(ownerAddress)).to.be.revertedWith(
        "ReentrancyGuard: reentrant call",
      );
    });
    it("Should not unstake, if cooldown not reached", async () => {
      await (await slashing.connect(alice).cooldown(ethers.utils.parseUnits("1000", 6))).wait();
      await expect(slashing.connect(alice).unstake(aliceAddress)).revertedWith(
        "Staking: insufficient cooldown",
      );
    });

    it("Should not unstake, if not cooldown", async () => {
      await expect(slashing.connect(alice).unstake(aliceAddress)).revertedWith(
        "Staking: nothing to unstake",
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
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
      await (await slashing.connect(Safe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);
      expect(beforeSlash.activeBalance.sub(afterSlash.activeBalance)).equal(
        ethers.utils.parseUnits("2500", 6),
      );
      const insuranceBalance = await stakeToken.balanceOf(insuranceFund.address);
      expect(insuranceBalance).equal(ethers.utils.parseUnits("2500", 6));
    });
    it("Should not be slashed when re entered", async () => {
      [owner, alice, bob, chris, Safe] = await ethers.getSigners();
      const ownerAddress = await owner.getAddress();
      const StakeToken = await ethers.getContractFactory("StakeERC20");
      const Slashing = await ethers.getContractFactory("Slashing");
      const Multisig = await ethers.getContractFactory("Safe");
      const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
      const stakeToken = await upgrades.deployProxy(StakeToken, [" Staked", "VSTKN", 6], {
        initializer: "__TestERC20_init",
      });
      const relayerSafe = await Multisig.deploy();
      await relayerSafe.deployed();
      const insuranceFund = await upgrades.deployProxy(InsuranceFund, [stakeToken.address]);
      await insuranceFund.deployed();
      const slashing = await upgrades.deployProxy(
        Slashing,
        [
          stakeToken.address,
          relayerSafe.address,
          await Safe.getAddress(),
          await Safe.getAddress(),
          432000, // 5 days
          insuranceFund.address,
        ],
        {
          initializer: "Slashing_init",
        },
      );
      await slashing.deployed();
      await (await slashing.connect(Safe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(ownerAddress)).wait();
      await (
        await stakeToken
          .connect(owner)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (
        await slashing.connect(owner).stake(ownerAddress, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await expect(slashing.connect(Safe).slash(ownerAddress)).to.be.revertedWith(
        "ReentrancyGuard: reentrant call",
      );
    });

    it("Should be slashed from both balances", async () => {
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
      await (await slashing.connect(Safe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);
      expect(afterSlash.inactiveBalance).equal(0);
      expect(afterSlash.activeBalance).equal(
        beforeSlash.activeBalance.sub(
          ethers.utils.parseUnits("2500", 6).sub(beforeSlash.inactiveBalance),
        ),
      );
      const insuranceBalance = await stakeToken.balanceOf(insuranceFund.address);
      expect(insuranceBalance).equal(ethers.utils.parseUnits("2500", 6));
    });
    it("Should be slashed from both balances for greater inactive balance", async () => {
      await (await slashing.connect(Safe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("10000", 6))
      ).wait();
      await (await slashing.connect(alice).cooldown(ethers.utils.parseUnits("10000", 6))).wait();
      const beforeSlash = await slashing.staker(aliceAddress);
      await (await slashing.connect(Safe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);

      const insuranceBalance = await stakeToken.balanceOf(insuranceFund.address);
      expect(insuranceBalance).equal(ethers.utils.parseUnits("2500", 6));
    });
    it("Should be slashed from both balances for greater inactive balance", async () => {
      await (
        await stakeToken.transfer(aliceAddress, ethers.utils.parseUnits("100000000", 6))
      ).wait();
      await (await slashing.connect(Safe).toggleStaking()).wait();
      await (await relayerSafe.setOwner(aliceAddress)).wait();
      await (
        await stakeToken
          .connect(alice)
          .approve(slashing.address, ethers.utils.parseUnits("100000000", 6))
      ).wait();
      await (
        await slashing.connect(alice).stake(aliceAddress, ethers.utils.parseUnits("100000000", 6))
      ).wait();
      const beforeSlash = await slashing.staker(aliceAddress);
      await (await slashing.connect(Safe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);

      const insuranceBalance = await stakeToken.balanceOf(insuranceFund.address);
      expect(insuranceBalance).equal(ethers.utils.parseUnits("25000000", 6));
    });
  });

  describe("Roles", function () {
    it("Should provide staker role", async () => {
      const stakerRole = "0xb9e206fa2af7ee1331b72ce58b6d938ac810ce9b5cdb65d35ab723fd67badf9e";
      await (
        await slashing.connect(Safe).grantRole(stakerRole, await bob.getAddress())
      ).wait();
      await (await slashing.connect(bob).toggleStaking()).wait();
    });

    it("Should provide staker role", async () => {
      const slasherRole = "0x12b42e8a160f6064dc959c6f251e3af0750ad213dbecf573b4710d67d6c28e39";
      await (
        await slashing.connect(Safe).grantRole(slasherRole, await chris.getAddress())
      ).wait();
      await (await slashing.connect(chris).updateSlashPenalty(2500)).wait();
    });
  });

  describe("Setters", () => {
    it("Should update min stake required amount", async () => {
      await (await slashing.connect(Safe).updateMinStakeRequired("50000000000")).wait();
      expect((await slashing.minStakeRequired()).toString()).equal("50000000000");
    });

    it("Should update relayer multisig address", async () => {
      await (
        await slashing.connect(Safe).updateRelayerMultisig(await chris.getAddress())
      ).wait();
      expect(await slashing.relayerMultisig()).equal(await chris.getAddress());
    });

    it("Should fail to execute staker role method", async () => {
      await expectRevert(slashing.toggleStaking(), "Staking: not staker role");
    });

    it("Should revert cooldown when zero active balance", async () => {
      await expectRevert(slashing.cooldown("10000000000"), "Staking: invalid balance to cooldown");
    });

    it("Should revert slash when no access", async () => {
      await expectRevert(slashing.slash(await chris.getAddress()), "Slashing: not slasher role");
    });
    it("should slash 0 amount when slash penalty and inactive balance is zero", async () => {
      let aliceAddress = await alice.getAddress();
      await slashing.connect(Safe).updateSlashPenalty(0);
      await (await slashing.connect(Safe).toggleStaking()).wait();
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
      await (await slashing.connect(Safe).slash(aliceAddress)).wait();
      const afterSlash = await slashing.staker(aliceAddress);
      expect(afterSlash.inactiveBalance).equal(0);
      const insuranceBalance = await stakeToken.balanceOf(insuranceFund.address);
      expect(insuranceBalance).equal(ethers.utils.parseUnits("0", 6));
    });

    it("Should revert when initialize again", async () => {
      await expectRevert(
        slashing.Slashing_init(
          stakeToken.address,
          relayerSafe.address,
          await Safe.getAddress(),
          await Safe.getAddress(),
          432000, // 5 days
          insuranceFund.address,
        ),
        "Initializable: contract is already initialized",
      );
    });
  });
});
