const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const assert = require("assert");
import { Signer, ContractReceipt, ContractTransaction } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("IndexPriceOracle", function () {
  let owner: string;
  let accounts: Signer[];
  let volmexOracleFactory: any;
  let volmexOracle: any;
  let volatilityIndexes: any;
  let volatilityTokenPrices: any;
  let proofHashes: any;
  let protocolFactory: any;
  let protocol: any;
  let collateralFactory: any;
  let collateral: any;
  let volatilityFactory: any;
  let volatility: any;
  let inverseVolatility: any;
  let zeroAddress: any;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  this.beforeAll(async function () {
    accounts = await ethers.getSigners();
    volmexOracleFactory = await ethers.getContractFactory("IndexPriceOracle");
    collateralFactory = await ethers.getContractFactory("TestERC20");
    volatilityFactory = await ethers.getContractFactory("VolmexPositionToken");
    protocolFactory = await ethers.getContractFactory("VolmexProtocol");
  });

  this.beforeEach(async function () {
    owner = await accounts[0].getAddress();
    collateral = await upgrades.deployProxy(collateralFactory, ["Volmex Collateral", "VDAI", 18], {
      initializer: "__TestERC20_init",
    });
    await collateral.deployed();

    volatility = await volatilityFactory.deploy();
    await volatility.deployed();
    let volReciept = await volatility.initialize("ETH Volatility Index", "ETHV");
    await volReciept.wait();

    inverseVolatility = await volatilityFactory.deploy();
    await inverseVolatility.deployed();
    volReciept = await inverseVolatility.initialize("Inverse ETH Volatility Index", "iETHV");
    await volReciept.wait();

    protocol = await upgrades.deployProxy(protocolFactory, [
      `${collateral.address}`,
      `${volatility.address}`,
      `${inverseVolatility.address}`,
      "25000000000000000000",
      "250",
    ]);
    await protocol.deployed();
    volmexOracle = await upgrades.deployProxy(volmexOracleFactory, [
      owner,
      [10000000],
      [volatility.address],
      [proofHash],
      [capRatio],
    ]);

    await volmexOracle.deployed();
    await volmexOracle.setObservationAdder(owner);
    await volmexOracle.grantInitialTimestampRole(owner);
    for (let i = 0; i < 10; i++) {
      await volmexOracle.addObservation([10000000], [0], [proofHash]);
      await time.increase(1000);
    }
  });
  describe("Deployment", function () {
    it("Should deploy volmex oracle", async () => {
      const receipt = await volmexOracle.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("Should fail to deploy if length of arrays is unequal", async () => {
      await expect(
        upgrades.deployProxy(
          volmexOracleFactory,
          [owner, [10000000, 100000000], [volatility.address], [proofHash], [capRatio]],
          {
            initializer: "initialize",
          },
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to deploy when asset address is 0", async () => {
      await expect(
        upgrades.deployProxy(
          volmexOracleFactory,
          [
            owner,
            [10000000],
            ["0x0000000000000000000000000000000000000000"],
            [proofHash],
            [capRatio],
          ],
          {
            initializer: "initialize",
          },
        ),
      ).to.be.revertedWith("IndexPriceOracle: Asset address can't be 0");
    });

    it("Should fail to initialize again ", async () => {
      await expectRevert(
        volmexOracle.initialize(owner, [100000], [volatility.address], [proofHash], [capRatio]),
        "Initializable: contract is already initialized",
      );
    });
  });
  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 10; i++) {
        await volmexOracle.addObservation([10000000], [0], [proofHash]);
      }

      const txn = await volmexOracle.getIndexSma(10000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(10000000);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(volmexOracle.addObservation([0], [0], [proofHash])).to.be.revertedWith(
        "IndexPriceOracle: Not zero",
      );
    });
    it("Should fail to add observation when caller is not observation adder", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        volmexOracle.connect(account1).addObservation([1000000], [0], [proofHash]),
      ).to.be.revertedWith("IndexPriceOracle: not observation adder");
    });

    it("Should get cumulative price", async () => {
      await volmexOracle.addObservation([10000000], [0], [proofHash]);

      const txn = await volmexOracle.getIndexSma(10000000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(10000000);
    });

    it("Should latest round data", async () => {
      await volmexOracle.addObservation([10000000], [0], [proofHash]);
      await time.increase(10000);

      const txn = await volmexOracle.latestRoundData(10000, 0);
      expect(Number(txn.answer)).equal(1000000000);
    });
    it("should  give last epoch price", async () => {
      await time.increase(28800);
      for (let i = 0; i < 50; i++) {
        await volmexOracle.addObservation([800000000], [0], [proofHash]);
      }

      const lastEpochPrice = await volmexOracle.getLastEpochTwap(0);
      expect(lastEpochPrice.price.toString()).to.be.equal("800000000");
    });

    it("Should get cumulative price with time delay", async () => {
      for (let i = 0; i < 9; i++) {
        await volmexOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        volmexOracle.getIndexSma(1000, 0),
        volmexOracle.getIndexSma(2000, 0),
        volmexOracle.getIndexSma(3000, 0),
        volmexOracle.getIndexSma(4000, 0),
        volmexOracle.getIndexSma(5000, 0),
        volmexOracle.getIndexSma(6000, 0),
        volmexOracle.getIndexSma(7000, 0),
        volmexOracle.getIndexSma(8000, 0),
        volmexOracle.getIndexSma(9000, 0),
        volmexOracle.getIndexSma(10000, 0),
        volmexOracle.getIndexSma(20000, 0),
      ]);
      txns.forEach(txn => {
        expect(Number(txn.volatilityTokenSma)).equal(10000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await volmexOracle.getIndexSma(20000, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(10000000);
      for (let i = 0; i < 9; i++) {
        await volmexOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await volmexOracle.getIndexSma(200, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(10000000);
      const txn3 = await volmexOracle.getIndexSma(200000, 0);
      expect(Number(txn3.volatilityTokenSma)).equal(10000000);
    });

    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await volmexOracle.getIndexSma(20, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(10000000);

      for (let i = 0; i < 10; i++) {
        await volmexOracle.addObservation([20000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txn2 = await volmexOracle.getIndexSma(9000, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(20000000);
    });

    it("Should fail to  add multiple observations because uneuqal length of inputs", async () => {
      await expect(
        volmexOracle.addAssets(
          [10000000, 20000000],
          [volatility.address],
          [proofHash],
          [capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to  add multiple observations because 0 address of a token", async () => {
      await expect(
        volmexOracle.addAssets(
          [10000000, 20000000],
          [volatility.address, ZERO_ADDR],
          [proofHash, proofHash],
          [capRatio, capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Asset address can't be 0");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        volmexOracle.connect(account1).setObservationAdder(account1.address),
      ).to.be.revertedWith("IndexPriceOracle: not admin");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(volmexOracle.setObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "IndexPriceOracle: zero address",
      );
    });
  });
});
