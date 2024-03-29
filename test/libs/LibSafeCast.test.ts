import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";

describe("PerpSafeCast test", async () => {
  const maxUint256 = BigNumber.from(2).pow(256).sub(1);
  const maxUint128 = BigNumber.from(2).pow(128).sub(1);
  const maxUint64 = BigNumber.from(2).pow(64).sub(1);
  const maxUint32 = BigNumber.from(2).pow(32).sub(1);
  const maxUint24 = BigNumber.from(2).pow(24).sub(1);
  const maxUint16 = BigNumber.from(2).pow(16).sub(1);
  const maxUint8 = BigNumber.from(2).pow(8).sub(1);
  const maxInt256 = BigNumber.from(2).pow(255).sub(1);
  const maxInt128 = BigNumber.from(2).pow(127).sub(1);
  const maxInt64 = BigNumber.from(2).pow(63).sub(1);
  const maxInt32 = BigNumber.from(2).pow(31).sub(1);
  const maxInt24 = BigNumber.from(2).pow(23).sub(1);
  const maxInt16 = BigNumber.from(2).pow(15).sub(1);
  const maxInt8 = BigNumber.from(2).pow(7).sub(1);
  const minInt128 = BigNumber.from(2).pow(127).mul(-1);
  const minInt64 = BigNumber.from(2).pow(63).mul(-1);
  const minInt32 = BigNumber.from(2).pow(31).mul(-1);
  const minInt24 = BigNumber.from(2).pow(23).mul(-1);
  const minInt16 = BigNumber.from(2).pow(15).mul(-1);
  const minInt8 = BigNumber.from(2).pow(7).mul(-1);
  let perpSafeCast;

  beforeEach(async () => {
    const perpSafeCastF = await ethers.getContractFactory("TestPerpSafeCast");
    perpSafeCast = await perpSafeCastF.deploy();
  });

  it("force error, toUint128 exceed range", async () => {
    await expect(perpSafeCast.testToUint128(maxUint128.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 128 bits",
    );
  });
  it("Should not toUint128 exceed range", async () => {
    await perpSafeCast.testToUint128(maxUint128);
  });
  it("force error, toUint64 exceed range", async () => {
    await expect(perpSafeCast.testToUint64(maxUint64.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 64 bits",
    );
  });
  it("force error, toUint64 exceed range", async () => {
    await perpSafeCast.testToUint64(maxUint64);
  });
  it("force error, toUint32 exceed range", async () => {
    await expect(perpSafeCast.testToUint32(maxUint32.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 32 bits",
    );
  });
  it("force error, toUint32 exceed range", async () => {
    await perpSafeCast.testToUint32(maxUint32);
  });
  it("force error, toUint16 exceed range", async () => {
    await expect(perpSafeCast.testToUint16(maxUint16.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 16 bits",
    );
  });
  it("force error, toUint16 exceed range", async () => {
    await perpSafeCast.testToUint16(maxUint16);
  });
  it("force error, toUint8 exceed range", async () => {
    await expect(perpSafeCast.testToUint8(maxUint8.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 8 bits",
    );
  });
  it("force error, toUint8 exceed range", async () => {
    await perpSafeCast.testToUint8(maxUint8);
  });
  it("force error, toInt128 exceed range", async () => {
    await expect(perpSafeCast.testToInt128(maxInt128.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 128 bits",
    );
    await expect(perpSafeCast.testToInt128(minInt128.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 128 bits",
    );
  });
  it("should not, toInt128 exceed range", async () => {
    await perpSafeCast.testToInt128(maxInt128);
    await perpSafeCast.testToInt128(minInt128);
  });
  it("should convert", async () => {
    await expect(perpSafeCast.testToInt64(maxInt64.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 64 bits",
    );

    await expect(perpSafeCast.testToInt64(minInt64.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 64 bits",
    );
  });
  it("should convert, toInt64 exceed range", async () => {
    await perpSafeCast.testToInt64(maxInt64);

    await perpSafeCast.testToInt64(minInt64);
  });
  it("force error, toInt32 exceed range", async () => {
    await expect(perpSafeCast.testToInt32(maxInt32.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 32 bits",
    );

    await expect(perpSafeCast.testToInt32(minInt32.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 32 bits",
    );
  });
  it("force error, toInt32 exceed range", async () => {
    await perpSafeCast.testToInt32(maxInt32);

    await perpSafeCast.testToInt32(minInt32);
  });
  it("force error, toInt24 exceed range", async () => {
    await expect(perpSafeCast.testToInt24(maxInt24.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in an 24 bits",
    );

    await expect(perpSafeCast.testToInt24(minInt24.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in an 24 bits",
    );
  });
  it("shlud convert, toInt24 exceed range", async () => {
    await perpSafeCast.testToInt24(maxInt24);

    await perpSafeCast.testToInt24(minInt24);
  });
  it("force error, toInt16 exceed range", async () => {
    await expect(perpSafeCast.testToInt16(maxInt16.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 16 bits",
    );
    await expect(perpSafeCast.testToInt16(minInt16.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 16 bits",
    );
  });
  it("force error, toInt16 exceed range", async () => {
    await perpSafeCast.testToInt16(maxInt16);
    await perpSafeCast.testToInt16(minInt16);
  });
  it("force error, toInt8 exceed range", async () => {
    await expect(perpSafeCast.testToInt8(maxInt8.add(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 8 bits",
    );

    await expect(perpSafeCast.testToInt8(minInt8.sub(1))).to.be.revertedWith(
      "SafeCast: value doesn't fit in 8 bits",
    );
  });
  it("shlud convert, toInt8 exceed range", async () => {
    await perpSafeCast.testToInt8(maxInt8);

    await perpSafeCast.testToInt8(minInt8);
  });
});
