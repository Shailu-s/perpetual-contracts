import { expect } from "chai";
import { BigNumber } from "ethers";
import { parseEther, parseUnits } from "ethers/lib/utils";
import { ethers } from "hardhat";

describe("SettlementTokenMath test", async () => {
  let settlementTokenMath: any;

  beforeEach(async () => {
    const settlementTokenMathF = await ethers.getContractFactory("TestSettlementTokenMath");
    settlementTokenMath = await settlementTokenMathF.deploy();
  });

  describe("parseSettlementToken", async () => {
    it("parse uint256 from 18 decimals", async () => {
      expect(
        await settlementTokenMath["testParseSettlementToken(uint256,uint8)"](
          parseUnits("1000", 18),
          18,
        ),
      ).to.be.eq(parseEther("1000"));
    });

    it("parse int256 from 18 decimals", async () => {
      expect(
        await settlementTokenMath["testParseSettlementToken(int256,uint8)"](
          parseUnits("-1000", 18),
          18,
        ),
      ).to.be.eq(parseEther("-1000"));
    });
  });

  describe("formatSettlementToken", async () => {
    it("format uint256 to 18 decimals", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(uint256,uint8)"](
          parseEther("1000"),
          18,
        ),
      ).to.be.eq(parseUnits("1000", 18));
    });

    it("format int256 to 18 decimals", async () => {
      expect(
        await settlementTokenMath["testFormatSettlementToken(int256,uint8)"](
          parseEther("-1000"),
          18,
        ),
      ).to.be.eq(parseUnits("-1000", 18));
    });
  });
});
