import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

describe("PerpMath test", async () => {
  const x96 = BigNumber.from(2).pow(96);
  const x10_18 = BigNumber.from(10).pow(18);
  const x10_6 = BigNumber.from(10).pow(6);
  const maxUint256 = BigNumber.from(2).pow(256).sub(1);
  const maxUint160 = BigNumber.from(2).pow(160).sub(1);
  const maxInt256 = BigNumber.from(2).pow(255).sub(1);
  const number = BigNumber.from(2).pow(20).sub(1);
  const minInt256 = BigNumber.from(2).pow(255).mul(-1);
  const maxUint24 = BigNumber.from(2).pow(24).sub(1);
  const maxInt128 = BigNumber.from(-2).pow(127);

  let perpMath;

  beforeEach(async () => {
    const perpMathF = await ethers.getContractFactory("TestPerpMath");
    perpMath = await perpMathF.deploy();
  });

  it("max", async () => {
    const a = maxInt256.sub(1);
    const b = maxInt256.sub(2);
    expect(await perpMath.testMax(a, b)).to.be.deep.eq(a);
  });

  it("min", async () => {
    const a = maxInt256.sub(1);
    const b = maxInt256.sub(2);
    expect(await perpMath.testMin(a, b)).to.be.deep.eq(b);
  });

  it("abs", async () => {
    expect(await perpMath.testAbs(minInt256.add(1))).to.be.deep.eq(minInt256.add(1).mul(-1));
  });

  it("force error, abs negative overflow", async () => {
    // TODO WIP pending PR for negative overflow
    await expect(perpMath.testAbs(minInt256)).to.be.revertedWith("PerpMath: inversion overflow");
  });
  it("neg", async () => {
    //TODO negative of given value;
    const result = await perpMath.neg128("100000000000000000");
    expect(result.toString()).to.be.equal("-100000000000000000");
  });
  it("neg uint", async () => {
    //TODO negative of given value;
    const result = await perpMath.uintNeg128("100000000000000000");
    expect(result.toString()).to.be.equal("-100000000000000000");
  });

  it("mulDiv", async () => {
    //TODO negative of given value;
    const result = await perpMath.testMulDiv("100000000000000000", "-100000000000000000", "10000");
    expect(result.toString()).to.be.equal("-1000000000000000000000000000000");
  });
  it("mulDiv transaction to be reverted", async () => {
    //TODO negative of given value;
    await expect(perpMath.testMulDiv("100000000000000000", "-100000000000000000", "0")).to.be
      .reverted;
  });
  it("mulDiv", async () => {
    //TODO negative of given value;
    const result = await perpMath.testMulDiv(
      "90",
      "-98",
      "345678987656787789870987987678767898769876876876",
    );
  });
  describe("mulRatio", () => {
    it("equals to uint256.mul().div(1e6)", async () => {
      // per on FullMath.mulDiv() specs, max input without overflow
      const value = BigNumber.from(2).pow(25).sub(1).div(2);
      const ratio = x10_6.mul(2);
      expect(await perpMath["testMulRatio(uint256,uint24)"](value, ratio)).to.be.deep.eq(
        value.mul(ratio).div(x10_6),
      );
    });

    it("throw error when overflow", async () => {
      await expect(perpMath["testMulRatio(uint256,uint24)"](maxUint256, maxUint24)).to.be.reverted;
    });
  });
});
