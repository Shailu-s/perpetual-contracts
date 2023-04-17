import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

describe.only("SettlementTokenMath test", async () => {
  const maxUint256 = BigNumber.from(2).pow(256).sub(1);
  const maxInt256 = BigNumber.from(2).pow(255).sub(1);
  const minInt256 = BigNumber.from(2).pow(255).mul(-1);

  let settlementTokenMath: any;

  beforeEach(async () => {
    const settlementTokenMathF = await ethers.getContractFactory("TestSettlementTokenMath");
    settlementTokenMath = await settlementTokenMathF.deploy();
  });

  describe("parseSettlementToken", async () => {
    it("parse uint256 from 8 decimals", async () => {
      expect(
        await settlementTokenMath["testParseSettlementToken(uint256,uint8)"](
          parseUnits("1000", 8),
          8,
        ),
      ).to.be.eq(parseEther("1000"));
    });

    it("parse int256 from 8 decimals", async () => {
      expect(
        await settlementTokenMath["testParseSettlementToken(int256,uint8)"](
          parseUnits("-1000", 8),
          8,
        ),
      ).to.be.eq(parseEther("-1000"));
    });
  });

  describe("formatSettlementToken", async () => {
    it("format uint256 to 8 decimals", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(uint256,uint8)"](
          parseEther("1000"),
          8,
        ),
      ).to.be.eq(parseUnits("1000", 8));
    });

    it("format int256 to 8 decimals", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(int256,uint8)"](
          parseEther("-1000"),
          8,
        ),
      ).to.be.eq(parseUnits("-1000", 8));
    });

    it("format with rounding down on positive number", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(int256,uint8)"](
          "100123456789123456789",
          8,
        ),
      ).to.be.eq("10012345678");
    });

    it("format with rounding down on negative number", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(int256,uint8)"](
          "-100123456789123456789",
          8,
        ),
      ).to.be.eq("-10012345678");
    });
  });
});
