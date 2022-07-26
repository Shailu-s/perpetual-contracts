import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

describe('MarkPriceOracle', function () {
  let MarkPriceOracle;
  let markPriceOracle;
  let ExchangeTest;
  let exchangeTest;

  this.beforeAll(async () => {
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    ExchangeTest = await ethers.getContractFactory("ExchangeTest");
  });

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();

    exchangeTest = await ExchangeTest.deploy();

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [
        exchangeTest.address,
        [],
        [],
      ],
      { 
        initializer: "initialize",
      }
    );
  });

  describe('Deployment', function () {   
    it("Should deploy successfully", async () => {
      let receipt = await upgrades.deployProxy(
        MarkPriceOracle,
        [
          exchangeTest.address,
          [],
          []
        ],
        { 
          initializer: "initialize",
        }
      );
      expect(receipt.confirmations).not.equal(0);
    });
  });
});