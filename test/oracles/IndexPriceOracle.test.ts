const { expect } = require("chai");
const { ethers, upgrades } = require("hardhat");
const assert = require("assert");
import { Signer, ContractReceipt, ContractTransaction } from "ethers";
const { expectRevert, time } = require("@openzeppelin/test-helpers");

describe("IndexPriceOracle", function () {
  let owner
  let accounts: Signer[];
  let indexPriceOracleFactory: any;
  let indexPriceOracle: any;
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

  this.beforeAll(async function () {
    

    indexPriceOracleFactory = await ethers.getContractFactory("IndexPriceOracle");

    collateralFactory = await ethers.getContractFactory("TestERC20");

    volatilityFactory = await ethers.getContractFactory("VolmexBaseToken");

    //protocolFactory = await ethers.getContractFactory("VolmexProtocol");
  });

  this.beforeEach(async function () {
    [owner] = await ethers.getSigners();
    collateral = await upgrades.deployProxy(
      collateralFactory,
       [
        "MyTestToken",
        "MKT",
        18
       ],
       {
        initializer:"__TestERC20_init"
       });
    await collateral.deployed();
    indexPriceOracle = await upgrades.deployProxy(
      indexPriceOracleFactory,
       [owner.address],
       {
        initializer:"initialize"
       });

    await indexPriceOracle.deployed();

    volatility = await volatilityFactory.deploy();
    await volatility.deployed();
    let volReciept = await volatility.initialize("ETH Volatility Index", "ETHV",indexPriceOracle.address,true);
    await volReciept.wait();

    inverseVolatility = await volatilityFactory.deploy();
    await inverseVolatility.deployed();
    volReciept = await inverseVolatility.initialize("Inverse ETH Volatility Index", "iETHV",indexPriceOracle.address,true);
    await volReciept.wait();

    // protocol = await upgrades.deployProxy(protocolFactory, [
    //   `${collateral.address}`,
    //   `${volatility.address}`,
    //   `${inverseVolatility.address}`,
    //   "25000000000000000000",
    //   "250",
    // ]);
    // await protocol.deployed();
   
  });

  it("Should deploy volmex oracle", async () => {
    const receipt = await indexPriceOracle.deployed();

    expect(receipt.confirmations).not.equal(0);
    await indexPriceOracle.updateTwapMaxDatapoints(180);

    // assert.equal(await protocol.collateral(), collateral.address);
    // assert.equal(await protocol.volatilityToken(), volatility.address);
    // assert.equal(await protocol.inverseVolatilityToken(), inverseVolatility.address);
    // assert.equal(await protocol.minimumCollateralQty(), "25000000000000000000");
    // assert.equal(await protocol.volatilityCapRatio(), "250");
  });
  it("Should fail to initialize again ",async()=>{
     await expect(indexPriceOracle.initialize()).to.be.revertedWith("Initializable: contract is already initialized")
  })

  xit("Should add volatility index datapoints and retrieve TWAP value", async () => {
    const volatilityIndex = "0";
    const volatilityTokenPrice1 = "105000000";
    const volatilityTokenPrice2 = "115000000";
    const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

    await indexPriceOracle.updateTwapMaxDatapoints(2);
  
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);
    await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2);

    assert.equal((await indexPriceOracle.getIndexDataPoints(volatilityIndex)).length, 2);

    await (await indexPriceOracle.updateBatchVolatilityTokenPrice(
      [volatilityIndex],
      [volatilityTokenPrice1],
      [proofHash]
    )).wait();
    await (await indexPriceOracle.updateBatchVolatilityTokenPrice(
      [volatilityIndex],
      [volatilityTokenPrice2],
      [proofHash]
    )).wait();

    const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
    assert.equal(indexTwap[0].toString(), "110000000");
    const indexTwapRoundData = await indexPriceOracle.latestRoundData(volatilityIndex);
    assert.equal(indexTwapRoundData[0].toString(), "11000000000");
  });

  xit("Should update the Batch volatility Token price", async () => {
    volatilityIndexes = ["0", "1"];
    volatilityTokenPrices = ["105000000", "105000000"];
    proofHashes = ["0x6c00000000000000000000000000000000000000000000000000000000000000", "0x6c00000000000000000000000000000000000000000000000000000000000000"];
    const contractTx = await indexPriceOracle.updateBatchVolatilityTokenPrice(
      volatilityIndexes,
      volatilityTokenPrices,
      proofHashes
    );
    const contractReceipt: ContractReceipt = await contractTx.wait();
    const event = contractReceipt.events?.find(
      (event) => event.event === "BatchVolatilityTokenPriceUpdated"
    );
    expect((await contractTx.wait()).confirmations).not.equal(0);
    assert.equal(event?.args?._volatilityIndexes.length, 2);
    assert.equal(event?.args?._volatilityTokenPrices.length, 2);
    assert.equal(event?.args?._proofHashes.length, 2);
    let prices = await indexPriceOracle.getVolatilityTokenPriceByIndex("0");
    assert.equal(prices[0].toString(), "115000000");
    assert.equal(prices[1].toString(), "135000000");
  });

  xit("Should not update if volatility price greater than cap ratio", async () => {
    volatilityIndexes = ["0"];
    volatilityTokenPrices = ["2105000000"];
    proofHashes = ["0x6c00000000000000000000000000000000000000000000000000000000000000"];
    await expectRevert(
      indexPriceOracle.updateBatchVolatilityTokenPrice(
        volatilityIndexes,
        volatilityTokenPrices,
        proofHashes
      ),
      "indexPriceOracle: _volatilityTokenPrice should be smaller than VolatilityCapRatio"
    );
  });

  it("should revert when length of input arrays are not equal", async () => {
    await expectRevert(
      indexPriceOracle.updateBatchVolatilityTokenPrice(
        ["0", "1"],
        ["105000000"],
        ["0x6c00000000000000000000000000000000000000000000000000000000000000"]
      ),
      "indexPriceOracle: length of input arrays are not equal"
    );
  });

  it("should update index by symbol", async () => {
    const contractTx: ContractTransaction = await indexPriceOracle.updateIndexBySymbol("ETHV", 3);
    const contractReceipt: ContractReceipt = await contractTx.wait();
    const event = contractReceipt.events?.find((event) => event.event === "SymbolIndexUpdated");
    assert.equal(event?.args?._index, 3);
    assert.equal(3, await indexPriceOracle.volatilityIndexBySymbol("ETHV"));
  });

  xit("should add volatility index", async () => {
    protocol = await upgrades.deployProxy(protocolFactory, [
      `${collateral.address}`,
      `${volatility.address}`,
      `${inverseVolatility.address}`,
      "25000000000000000000",
      "250",
    ]);
    await protocol.deployed();
    const contractTx = await indexPriceOracle.addVolatilityIndex(
      "125000000",
      protocol.address,
      "ETHV2X",
      0,
      0,
      "0x6c00000000000000000000000000000000000000000000000000000000000000"
    );
    const contractReceipt: ContractReceipt = await contractTx.wait();
    const event = contractReceipt.events?.find((event) => event.event === "VolatilityIndexAdded");
    const price = await indexPriceOracle.getVolatilityPriceBySymbol("ETHV2X");
    const price1 = await indexPriceOracle.getVolatilityTokenPriceByIndex(2);
    assert.equal(event?.args?.volatilityTokenIndex, 2);
    assert.equal(event?.args?.volatilityCapRatio, 250000000);
    assert.equal(event?.args?.volatilityTokenSymbol, "ETHV2X");
    assert.equal(event?.args?.volatilityTokenPrice, 125000000);
    assert.equal(price[0].toString(), "125000000");
    assert.equal(price[1].toString(), "125000000");
    assert.equal(price1[0].toString(), "125000000");
    assert.equal(price1[1].toString(), "125000000");
  });

  xit("should add volatility index if leverage is greater than 1", async () => {
    protocol = await upgrades.deployProxy(protocolFactory, [
      `${collateral.address}`,
      `${volatility.address}`,
      `${inverseVolatility.address}`,
      "25000000000000000000",
      "125",
    ]);
    await protocol.deployed();
    const contractTx = await indexPriceOracle.addVolatilityIndex(
      "1250000000",
      protocol.address,
      "ETHV2X",
      2,
      0,
      "0x6c00000000000000000000000000000000000000000000000000000000000000"
    );
    const contractReceipt: ContractReceipt = await contractTx.wait();
    const event = contractReceipt.events?.find(
      (event) => event.event === "LeveragedVolatilityIndexAdded"
    );
    assert.equal(event?.args?.volatilityTokenIndex, 2);
    assert.equal(event?.args?.volatilityCapRatio, 125000000);
    assert.equal(event?.args?.volatilityTokenSymbol, "ETHV2X");
    assert.equal(event?.args?.leverage, 2);
    assert.equal(event?.args?.baseVolatilityIndex, 0);

    let receipt = await indexPriceOracle.getVolatilityPriceBySymbol("ETHV2X");
    assert.equal(receipt[0].toString(), "62500000");
    receipt = await indexPriceOracle.getVolatilityTokenPriceByIndex(2);
    assert.equal(receipt[0].toString(), "62500000");
    receipt = await indexPriceOracle.getIndexTwap(2);
    assert.equal(receipt[0].toString(), "62500000");
  });

  // describe("Price Timestamp", function () {
  //   let volatilityIndexes: number[];
  //   this.beforeEach(async () => {
  //     protocol = await upgrades.deployProxy(protocolFactory, [
  //       `${collateral.address}`,
  //       `${volatility.address}`,
  //       `${inverseVolatility.address}`,
  //       "25000000000000000000",
  //       "125",
  //     ]);
  //     await protocol.deployed();
  //     await (
  //       await indexPriceOracle.addVolatilityIndex(
  //         "1250000000",
  //         protocol.address,
  //         "ETHV2X",
  //         2,
  //         0,
  //         "0x6c00000000000000000000000000000000000000000000000000000000000000"
  //       )
  //     ).wait();
  //     volatilityIndexes = [2];
  //     volatilityTokenPrices = ["100000000"];
  //     proofHashes = ["0x6c00000000000000000000000000000000000000000000000000000000000000"];
  //     await (
  //       await indexPriceOracle.updateBatchVolatilityTokenPrice(
  //         volatilityIndexes,
  //         volatilityTokenPrices,
  //         proofHashes
  //       )
  //     ).wait();
  //   });
    // TODO Handle by Vijay
    it("Should fetch the latest timestamp", async () => {
      let receipt = await indexPriceOracle.getIndexTwap(volatilityIndexes[0]);
      let priceTimestamp = Number(receipt[2].toString());
      let currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.below(300, "Oracle price is stale");

      receipt = await indexPriceOracle.getVolatilityTokenPriceByIndex(volatilityIndexes[0]);
      priceTimestamp = Number(receipt[2].toString());
      currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.below(300, "Oracle price is stale");

      receipt = await indexPriceOracle.getVolatilityPriceBySymbol("ETHV2X");
      priceTimestamp = Number(receipt[2].toString());
      currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.below(300, "Oracle price is stale");
    });

    it("Should fetch the stake price", async () => {
      let currentTimestamp = Number((await time.latest()).toString());

      await time.increase(3600);
      let receipt = await indexPriceOracle.getIndexTwap(volatilityIndexes[0]);
      let priceTimestamp = Number(receipt[2].toString());
      currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.above(1800, "Oracle price is stale");
  
      receipt = await indexPriceOracle.getVolatilityTokenPriceByIndex(volatilityIndexes[0]);
      priceTimestamp = Number(receipt[2].toString());
      currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.above(1800, "Oracle price is stale");
  
      receipt = await indexPriceOracle.getVolatilityPriceBySymbol("ETHV2X");
      priceTimestamp = Number(receipt[2].toString());
      currentTimestamp = Number((await time.latest()).toString());
      expect(currentTimestamp - priceTimestamp).to.be.above(1800, "Oracle price is stale");
      console.log("\t ORACLE PRICE IS STALE by: ", currentTimestamp - priceTimestamp, " seconds");
    });
  
    // TODO Handle By Vijay
  // xit("update base volatility ", async () => {
  //   protocol = await upgrades.deployProxy(protocolFactory, [
  //     `${collateral.address}`,
  //     `${volatility.address}`,
  //     `${inverseVolatility.address}`,
  //     "25000000000000000000",
  //     "250",
  //   ]);
  //   await protocol.deployed();
  //   await indexPriceOracle.addVolatilityIndex(
  //     "250000000",
  //     protocol.address,
  //     "ETHV2X",
  //     0,
  //     0,
  //     "0x6c00000000000000000000000000000000000000000000000000000000000000"
  //   );
  //   const contractTx = await indexPriceOracle.updateBaseVolatilityIndex(0, 1);
  //   const contractReceipt: ContractReceipt = await contractTx.wait();
  //   const event = contractReceipt.events?.find(
  //     (event) => event.event === "BaseVolatilityIndexUpdated"
  //   );
  //   assert.equal(event?.args?.baseVolatilityIndex, 1);
  // });

  // xit("should revert if invalid baseVolatility index is provided", async () => {
  //   protocol = await upgrades.deployProxy(protocolFactory, [
  //     `${collateral.address}`,
  //     `${volatility.address}`,
  //     `${inverseVolatility.address}`,
  //     "25000000000000000000",
  //     "250",
  //   ]);
  //   await protocol.deployed();
  //   await expectRevert(
  //     indexPriceOracle.addVolatilityIndex(
  //       "125000000",
  //       protocol.address,
  //       "ETHV2X",
  //       2,
  //       2,
  //       "0x6c00000000000000000000000000000000000000000000000000000000000000"
  //     ),
  //     "indexPriceOracle: Invalid _baseVolatilityIndex provided"
  //   );
  // });

  it("should revert when cap ratio is smaller than 1000000", async () => {
    // protocol = await upgrades.deployProxy(protocolFactory, [
    //   `${collateral.address}`,
    //   `${volatility.address}`,
    //   `${inverseVolatility.address}`,
    //   "25000000000000000000",
    //   "0",
    // ]);
    // await protocol.deployed();
    // indexPriceOracle = await upgrades.deployProxy(indexPriceOracleFactory, [owner]);
    // assert.equal(await protocol.collateral(), collateral.address);
    // assert.equal(await protocol.volatilityToken(), volatility.address);
    // assert.equal(await protocol.inverseVolatilityToken(), inverseVolatility.address);
    // assert.equal(await protocol.minimumCollateralQty(), "25000000000000000000");
    await expectRevert(
      indexPriceOracle.addVolatilityIndex(
        0,
        protocol.address,
        "ETHV2X",
        2,
        0,
        "0x6c00000000000000000000000000000000000000000000000000000000000000"
      ),
      "indexPriceOracle: volatility cap ratio should be greater than 1000000"
    );
  });

  it("should revert if protocol address is zero", async () => {
    zeroAddress = "0x0000000000000000000000000000000000000000";
    await expectRevert(
      indexPriceOracle.addVolatilityIndex(
        0,
        zeroAddress,
        "ETHV2X",
        2,
        0,
        "0x6c00000000000000000000000000000000000000000000000000000000000000"
      ),
      "indexPriceOracle: protocol address can't be zero"
    );
  });

  xit("should revert when volatility token price is greater than cap ratio", async () => {
    protocol = await upgrades.deployProxy(protocolFactory, [
      `${collateral.address}`,
      `${volatility.address}`,
      `${inverseVolatility.address}`,
      "25000000000000000000",
      "250",
    ]);
    await protocol.deployed();
    assert.equal(await protocol.collateral(), collateral.address);
    assert.equal(await protocol.volatilityToken(), volatility.address);
    assert.equal(await protocol.inverseVolatilityToken(), inverseVolatility.address);
    assert.equal(await protocol.minimumCollateralQty(), "25000000000000000000");
    await expectRevert(
      indexPriceOracle.addVolatilityIndex(
        "251000000",
        protocol.address,
        "ETHV2X",
        0,
        0,
        "0x6c00000000000000000000000000000000000000000000000000000000000000"
      ),
      "indexPriceOracle: _volatilityTokenPrice should be smaller than VolatilityCapRatio"
    );
  });

  describe("variable volatility index data points average", () => {
    it("Should add 1 volatility index datapoints and retrieve TWAP value", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 125000000;

      for (let index = 0; index < 1; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
        volatilityTokenPrice1 += 500000;
      }
      const datapoints = await indexPriceOracle.getIndexDataPoints(volatilityIndex);
      assert.equal(datapoints.length, 2);
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "125000000");
    });
    it("Should add 57 volatility index datapoints and retrieve TWAP value", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 125000000;

      for (let index = 0; index < 57; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
        volatilityTokenPrice1 += 500000;
      }
      const datapoints = await indexPriceOracle.getIndexDataPoints(volatilityIndex);
      assert.equal(datapoints.length, 58);
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "138758620");
    });
    it("Should add 100 volatility index datapoints and retrieve TWAP value", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 125000000;

      for (let index = 0; index < 100; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
        volatilityTokenPrice1 += 500000;
      }
      const datapoints = await indexPriceOracle.getIndexDataPoints(volatilityIndex);
      assert.equal(datapoints.length, 101);
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "149504950");
    });
    it("Should add 180 volatility index datapoints and retrieve TWAP value", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 125000000;

      for (let index = 0; index < 179; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
        volatilityTokenPrice1 += 500000;
      }
      const datapoints = await indexPriceOracle.getIndexDataPoints(volatilityIndex);
      assert.equal(datapoints.length, 180);
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "169252777");
    });
  })
  describe("variable volatility index data points average", () => {
    it("Should volatility index datapoints for min precision loss", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 125000000;
      let volatilityTokenPrice2 = 126000000;
      await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice2)
      for (let index = 0; index < 178; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
      }
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "125005555");
    });
    it("Should add volatility index datapoint for max precision loss", async () => {
      const volatilityIndex = "0";
      let volatilityTokenPrice1 = 35890000;

      for (let index = 0; index < 179; index++) {
        await indexPriceOracle.addIndexDataPoint(volatilityIndex, volatilityTokenPrice1)
        volatilityTokenPrice1 += 990000;
      }
      const indexTwap = await indexPriceOracle.getIndexTwap(volatilityIndex);
      assert.equal(indexTwap[0].toString(), "124005555");
    });
  })
});
