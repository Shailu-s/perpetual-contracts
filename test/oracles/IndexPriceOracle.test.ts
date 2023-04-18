import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { Signer } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("IndexPriceOracle", function () {
  let owner: string;
  let accounts: Signer[];
  let indexOracleFactory: any;
  let indexOracle: any;
  let volmexBaseToken: any;
  let baseToken: any;
  const epochTimeSeconds = 28800;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  this.beforeAll(async function () {
    accounts = await ethers.getSigners();
    indexOracleFactory = await ethers.getContractFactory("IndexPriceOracle");
    volmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
  });

  this.beforeEach(async function () {
    owner = await accounts[0].getAddress();
    baseToken = await upgrades.deployProxy(
      volmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner, // priceFeedArg
        true, // isBase
      ]
    );
    indexOracle = await upgrades.deployProxy(indexOracleFactory, [
      owner,
      [75000000],
      [baseToken.address],
      [proofHash],
      [capRatio],
    ]);
    await (await baseToken.setPriceFeed(indexOracle.address)).wait();
    await indexOracle.deployed();
    await indexOracle.setObservationAdder(owner);
    await indexOracle.grantInitialTimestampRole(owner);
    await (await indexOracle.setInitialTimestamp((await time.latest()).toString()));
  });

  describe("Epoch", () => {
    it("Should calculate epoch of one price", async () => {
      await time.increase(epochTimeSeconds * 2);
      await (await indexOracle.addObservation(["76000000"], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      expect((await indexOracle.getLastEpochPrice(0))[0].toString()).equal("76000000");
    });

    it("Should calculate epoch of average values in that epoch", async () => {
      await time.increase(epochTimeSeconds * 2);
      let sum = 0;
      let index;
      for (index = 0; index < 10; ++index) {
        await (await indexOracle.addObservation([100000000 + index * 1000000], [0], [proofHash])).wait();
        sum += 100000000 + index * 1000000;
      }
      const priceCumulative = sum / index;
      expect((await indexOracle.getLastEpochPrice(0))[0].toString()).equal(priceCumulative.toString());
    });

    it("Should skip an epoch and fills the epoch correctly", async () => {
      await time.increase(epochTimeSeconds * 2);
      await (await indexOracle.addObservation([76000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds * 2);
      await (await indexOracle.addObservation([86000000], [0], [proofHash])).wait();
      await time.increase(epochTimeSeconds);
      const indexLength = await indexOracle.getIndexPriceByEpoch(0);
      expect((await indexOracle.getLastEpochPrice(0))[0].toString()).equal("86000000");
      expect(indexLength.toString()).equal("2");
    })
  })

  describe("Deployment", function () {
    it("Should deploy volmex oracle", async () => {
      const receipt = await indexOracle.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("Should fail to deploy if length of arrays is unequal", async () => {
      await expect(
        upgrades.deployProxy(
          indexOracleFactory,
          [owner, [10000000, 100000000], [baseToken.address], [proofHash], [capRatio]],
          {
            initializer: "initialize",
          },
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to deploy when asset address is 0", async () => {
      await expect(
        upgrades.deployProxy(
          indexOracleFactory,
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
        indexOracle.initialize(owner, [100000], [baseToken.address], [proofHash], [capRatio]),
        "Initializable: contract is already initialized",
      );
    });
  });
  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 10; i++) {
        await indexOracle.addObservation([10000000], [0], [proofHash]);
      }

      const txn = await indexOracle.getIndexSma(10000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(15909090);
    });

    it("should fail to add observation when cumulative price is zero ", async () => {
      await expect(indexOracle.addObservation([0], [0], [proofHash])).to.be.revertedWith(
        "IndexPriceOracle: Not zero",
      );
    });
    it("Should fail to add observation when caller is not observation adder", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        indexOracle.connect(account1).addObservation([1000000], [0], [proofHash]),
      ).to.be.revertedWith("IndexPriceOracle: not observation adder");
    });

    it("Should get cumulative price", async () => {
      await indexOracle.addObservation([10000000], [0], [proofHash]);

      const txn = await indexOracle.getIndexSma(10000000, 0);
      expect(Number(txn.volatilityTokenSma)).equal(42500000);
    });

    it("Should latest round data", async () => {
      await indexOracle.addObservation([10000000], [0], [proofHash]);
      await time.increase(10000);

      const txn = await indexOracle.latestRoundData(10000, 0);
      expect(Number(txn.answer)).equal(1000000000);
    });
    it("should  give last epoch price", async () => {
      await time.increase(28800 * 2);

      for (let i = 0; i < 50; i++) {
        await indexOracle.addObservation([800000000], [0], [proofHash]);
      }

      const lastEpochPrice = (await indexOracle.getLastEpochPrice(0))[0];
      expect(lastEpochPrice.toString()).to.be.equal("800000000");
    });

    it("should  give average price last epoch price", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 5; i++) {
        await indexOracle.addObservation([800000000], [0], [proofHash]);
      }
      for (let i = 0; i < 5; i++) {
        await indexOracle.addObservation([900000000], [0], [proofHash]);
      }

      const lastEpochPrice = await indexOracle.getLastEpochPrice(0);
      expect(parseInt(lastEpochPrice)).to.be.equal(849999998);
    });

    it("Should get cumulative price with time delay", async () => {
      await time.increase(28800 * 2);
      for (let i = 0; i < 9; i++) {
        await indexOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txns = await Promise.all([
        indexOracle.getIndexSma(1000, 0),
        indexOracle.getIndexSma(2000, 0),
        indexOracle.getIndexSma(3000, 0),
        indexOracle.getIndexSma(4000, 0),
        indexOracle.getIndexSma(5000, 0),
        indexOracle.getIndexSma(6000, 0),
        indexOracle.getIndexSma(7000, 0),
        indexOracle.getIndexSma(8000, 0),
        indexOracle.getIndexSma(9000, 0),
        indexOracle.getIndexSma(10000, 0),
        indexOracle.getIndexSma(20000, 0),
      ]);
      txns.forEach(txn => {
        expect(Number(txn.volatilityTokenSma)).equal(10000000);
      });
    });

    it("Should not error when there are no recent datapoints added for cumulative price", async () => {
      const txn1 = await indexOracle.getIndexSma(20000, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(75000000);
      for (let i = 0; i < 9; i++) {
        await indexOracle.addObservation([10000000], [0], [proofHash]);
        await time.increase(1000);
      }
      // this covers the case of zero recent datapoints
      await time.increase(100000);
      const txn2 = await indexOracle.getIndexSma(200, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(16500000);
      const txn3 = await indexOracle.getIndexSma(200000, 0);
      expect(Number(txn3.volatilityTokenSma)).equal(16500000);
    });

    it("Should not error when there are no recent datapoints then more datapoints are added for cumulative price", async () => {
      await time.increase(200001);
      const txn1 = await indexOracle.getIndexSma(20, 0);
      expect(Number(txn1.volatilityTokenSma)).equal(75000000);

      for (let i = 0; i < 10; i++) {
        await indexOracle.addObservation([20000000], [0], [proofHash]);
        await time.increase(1000);
      }
      const txn2 = await indexOracle.getIndexSma(9000, 0);
      expect(Number(txn2.volatilityTokenSma)).equal(20000000);
    });

    it("Should fail to  add multiple observations because uneuqal length of inputs", async () => {
      await expect(
        indexOracle.addAssets(
          [10000000, 20000000],
          [baseToken.address],
          [proofHash],
          [capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Unequal length of prices & assets");
    });

    it("Should fail to  add multiple observations because 0 address of a token", async () => {
      await expect(
        indexOracle.addAssets(
          [10000000, 20000000],
          [baseToken.address, ZERO_ADDR],
          [proofHash, proofHash],
          [capRatio, capRatio],
        ),
      ).to.be.revertedWith("IndexPriceOracle: Asset address can't be 0");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(
        indexOracle.connect(account1).setObservationAdder(account1.address),
      ).to.be.revertedWith("IndexPriceOracle: not admin");
    });
    it("should fail to set Matching engine as admin assecc is not provided", async () => {
      const [owner, account1] = await ethers.getSigners();
      await expect(indexOracle.setObservationAdder(ZERO_ADDR)).to.be.revertedWith(
        "IndexPriceOracle: zero address",
      );
    });
  });
});
