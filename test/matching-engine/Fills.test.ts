import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
const { Order, Asset, sign, encodeAddress } = require("../order");
import { BigNumber } from "ethers";
import { Result } from "ethers/lib/utils";

const convert = (num: number) => {
  const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
  return BigNumber.from(num).mul(one).toString();
};

describe("MatchingEngine", function () {
  let MatchingEngine;
  let matchingEngine;
  let PerpetualOracle;
  let perpetualOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const deadline = 87654321987654;
  let orderLeft, orderRight;
  let owner, alice, bob;
  const ORDER = "0xf555eb98";
  const isShort = true;
  let salt = 0;

  this.beforeAll(async () => {
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
  });

  this.beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "Virtual EVIV Perp", // nameArg
        "VEVIVP", // symbolArg,
        alice.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();

    volmexQuoteToken = await upgrades.deployProxy(VolmexQuoteToken, [
      "Virtual USDC",
      "VUSDC",
      false,
    ]);
    await volmexQuoteToken.deployed();

    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [volmexBaseToken.address, volmexBaseToken.address],
        [10000000, 10000000],
        [10000000, 10000000],
        [proofHash, proofHash],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);
    await matchingEngine.deployed();
    await (await matchingEngine.grantMatchOrders(owner.address)).wait();
    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
  });

  xit("Should deploy matching engine", async () => {
    const receipt = await matchingEngine.deployed();
    expect(receipt.confirmations).not.equal(0);
  });

  xit("Should match order", async () => {
    const orderLeft = Order(
      ORDER,
      deadline,
      alice.address,
      Asset(volmexBaseToken.address, convert(1)),
      Asset(volmexQuoteToken.address, convert(2)),
      ++salt,
      0,
      isShort,
    );

    const orderRight = Order(
      ORDER,
      deadline,
      bob.address,
      Asset(volmexQuoteToken.address, convert(2)),
      Asset(volmexBaseToken.address, convert(1)),
      ++salt,
      0,
      !isShort,
    );

    const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
    const newFills = matchedFills(receipt);
    console.log("orderLeft  ", 1, 2);
    console.log("orderRight ", 2, 1);
    console.log("Fills      ", newFills.leftValue, newFills.rightValue);
  });

  describe("Left order - EVIV perp", () => {
    describe("Left order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(volmexQuoteToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 20, 200);
        console.log("orderRight ", 110, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 100);
        console.log("orderRight ", 110, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(220)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 100);
        console.log("orderRight ", 220, 20);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
    });

    describe("Both order price same", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(volmexQuoteToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 20, 200);
        console.log("orderRight ", 100, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 100);
        console.log("orderRight ", 100, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 100);
        console.log("orderRight ", 200, 20);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
    });

    describe("Right order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(volmexQuoteToken.address, convert(220)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 20, 220);
        console.log("orderRight ", 100, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 110);
        console.log("orderRight ", 110, 10);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexQuoteToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 10, 110);
        console.log("orderRight ", 220, 20);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
    });
  });

	describe("Right order - EVIV perp", () => {
		describe("Right order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(220)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 220, 20);
        console.log("orderRight ", 10, 100);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(100)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 110, 10);
        console.log("orderRight ", 10, 100);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(110)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(volmexQuoteToken.address, convert(200)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 110, 10);
        console.log("orderRight ", 20, 200);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
    });

		describe("Left order fill with better price", () => {
      it("Should left partial and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(200)),
          Asset(volmexBaseToken.address, convert(20)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(110)),
          ++salt,
          0,
        	isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 200, 20);
        console.log("orderRight ", 10, 110);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left and right complete fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(10)),
          Asset(volmexQuoteToken.address, convert(110)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 100, 10);
        console.log("orderRight ", 10, 110);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
      it("Should left complete and right partial fill", async () => {
        orderLeft = Order(
          ORDER,
          deadline,
          alice.address,
          Asset(volmexQuoteToken.address, convert(100)),
          Asset(volmexBaseToken.address, convert(10)),
          ++salt,
          0,
          !isShort,
        );

        orderRight = Order(
          ORDER,
          deadline,
          bob.address,
          Asset(volmexBaseToken.address, convert(20)),
          Asset(volmexQuoteToken.address, convert(220)),
          ++salt,
          0,
          isShort,
        );
        const receipt = await (await matchingEngine.matchOrders(orderLeft, orderRight)).wait();
        const newFills = matchedFills(receipt);
        console.log("orderLeft  ", 100, 10);
        console.log("orderRight ", 20, 220);
        console.log("Fills      ", newFills.leftValue, newFills.rightValue);
      });
    });
	})
});

const oneE18 = "1000000000000000000";
const matchedFills = (receipt: Result) => {
  const matched = receipt.events?.filter(x => {
    return x.event == "Matched";
  });
  return {
    leftValue: Number(matched[0].args[3].toString()) / Number(oneE18),
    rightValue: Number(matched[0].args[4].toString()) / Number(oneE18),
  };
};
