import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe('MarkPriceOracle', function () {
  let MarkPriceOracle;
  let markPriceOracle;
  let ExchangeTest;
  let exchangeTest;
  let factory;
  let Factory;
  let volmexBaseToken;
  let newToken;
  let VolmexBaseToken;
  let indexPriceOracle;
  let IndexPriceOracle;
  let MatchingEngine;
  let matchingEngine;
  let erc20TransferProxy;
  let ERC20TransferProxyTest;
  let community;

  this.beforeAll(async () => {
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    ExchangeTest = await ethers.getContractFactory("ExchangeTest");
    Factory = await ethers.getContractFactory("Factory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
  });

  beforeEach(async () => {
    const [owner, account1, account2, account3, account4] = await ethers.getSigners()

    exchangeTest = await ExchangeTest.deploy();

    erc20TransferProxy = await ERC20TransferProxyTest.deploy()
    community = account4.address

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [
        owner.address,
      ],
      { 
        initializer: "initialize",
      }
    );

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        true, // isBase
        indexPriceOracle.address, // priceFeedArg
      ],
      {
        initializer: "initialize",
      }
    );


    newToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "NewToken", // nameArg
        "NTK", // symbolArg,
        true, // isBase
        indexPriceOracle.address, // priceFeedArg
      ],
      {
        initializer: "initialize",
      }
    );

    factory = await upgrades.deployProxy(
      Factory,
      [
        volmexBaseToken.address, // implementation
      ],
      {
        initializer: "initialize"
      }
    );

    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [
        [10000000],
        [volmexBaseToken.address],
      ],
      { 
        initializer: "initialize",
      }
    );

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [
        erc20TransferProxy.address, 
        300, 
        community, 
        owner.address,
        markPriceOracle.address,
      ],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );
    await markPriceOracle.setMatchingEngine(matchingEngine.address);

    await exchangeTest.setMarkPriceOracle(markPriceOracle.address);
  });

  describe('Deployment', function () {   
    it("Should deploy successfully", async () => {
      let receipt = await upgrades.deployProxy(
        MarkPriceOracle,
        [
          [10000000],
          [volmexBaseToken.address],
        ],
        { 
          initializer: "initialize",
        }
      );
      expect(receipt.confirmations).not.equal(0);
    });

    it("Should fail to deploy if length of arrays is unequal", async () => {
      await expect(
        upgrades.deployProxy(
          MarkPriceOracle,
          [
            [10000000],
            [],
          ],
          { 
            initializer: "initialize",
          }
        ),
      ).to.be.revertedWith("MarkSMA: Unequal length of prices & assets");
    });

    it("Should fail to deploy when price is <= 1000000", async () => {
      await expect(
        upgrades.deployProxy(
          MarkPriceOracle,
          [
            [100000],
            [volmexBaseToken.address],
          ],
          { 
            initializer: "initialize",
          }
        ),
      ).to.be.revertedWith("MarkSMA: Not decimal precise");
    });

    it("Should fail to deploy when asset address is 0", async () => {
      await expect(
        upgrades.deployProxy(
          MarkPriceOracle,
          [
            [10000000],
            ['0x0000000000000000000000000000000000000000'],
          ],
          { 
            initializer: "initialize",
          }
        ),
      ).to.be.revertedWith("MarkSMA: Asset address can't be 0");
    });
  });

  describe("Add Observation", async () => {
    it("Should add observation", async () => {
      for (let i = 0; i < 9; i++) {
        await matchingEngine.addObservation(10000000, 0);
      }

      const txn = await markPriceOracle.getCumulativePrice(10000000, 0);
      // Total cumulative = 100000000 (One added while MarkPriceOracle deployment & rest 9 using loop)
      // Total observations = 10
      // Cumulative = (Total cumulative / Total observations) 
      //            = (100000000 / 10) 
      //            = 10000000
      expect(Number(txn)).equal(10000000);
    });

    it("Should add multiple observations", async () => {
      await matchingEngine.addAssets([10000000, 20000000], [volmexBaseToken.address, newToken.address]);

      const txn = await markPriceOracle.getCumulativePrice(10000000, 0);
      expect(Number(txn)).equal(10000000);
    });

    it("Should fail to add observation when caller is not exchange", async () => {
      await expect(
        markPriceOracle.addObservation(1000000, 0)
      ).to.be.revertedWith("MarkSMA: Not MatchingEngine");
    });

    it("Should fail to add observation when cumulative price is <= 1000000", async () => {
      await expect(
        matchingEngine.addObservation(1000000, 0)
      ).to.be.revertedWith("MarkSMA: Not decimal precise");
    });

    it("Should get cumulative price", async () => {
      const txn = await markPriceOracle.getCumulativePrice(1000000, 0);
      expect(Number(txn)).equal(10000000);
    });
  });
});
