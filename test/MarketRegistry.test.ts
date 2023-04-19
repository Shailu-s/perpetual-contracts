import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";

describe("Positioning", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxy;
  let TransferManagerTest;
  let ERC1271Test;
  let PositioningConfig;
  let positioningConfig;

  let AccountBalance;
  let accountBalance;
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexPerpPeriphery;

  let transferManagerTest;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let perpViewFake;
  let orderLeft, orderRight;
  const deadline = 87654321987654;
  const maxFundingRate = 0.08;
  let owner, account1, account2, account3, account4, relayer;
  let liquidator;

  const one = ethers.constants.WeiPerEther; // 1e18
  const five = ethers.constants.WeiPerEther.mul(BigNumber.from("5")); // 5e18
  const ten = ethers.constants.WeiPerEther.mul(BigNumber.from("10000")); // 10e18
  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "400000000";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    // fundingRate = await smock.fake("FundingRate")
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxy = await ethers.getContractFactory("ERC20TransferProxy");
    TransferManagerTest = await ethers.getContractFactory("TransferManagerTest");
    ERC1271Test = await ethers.getContractFactory("ERC1271Test");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    BaseToken = await ethers.getContractFactory("VolmexBaseToken");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    [owner, account1, account2, account3, account4, relayer] = await ethers.getSigners();
  });

  beforeEach(async () => {
    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        account1.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [100000000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await indexPriceOracle.deployed();
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[100000000], [volmexBaseToken.address], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();
    await (await indexPriceOracle.grantInitialTimestampRole(markPriceOracle.address)).wait();

    baseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "BaseToken", // nameArg
        "BTN", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await baseToken.deployed();

    erc20TransferProxy = await upgrades.deployProxy(ERC20TransferProxy, [], {
      initializer: "erc20TransferProxyInit",
    });
    await erc20TransferProxy.deployed();

    erc1271Test = await ERC1271Test.deploy();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [markPriceOracle.address]);
    await positioningConfig.deployed();
    await markPriceOracle.grantSmaIntervalRole(positioningConfig.address);
    accountBalance = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, markPriceOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await markPriceOracle.setObservationAdder(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();
    await virtualToken.setMintBurnRole(owner.address);

    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

    // await marketRegistry.connect(owner).addBaseToken(virtualToken.address)
    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    // await marketRegistry.connect(owner).addBaseToken(baseToken.address)
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);
  });
  describe("Deploy", async () => {
    it("shoud successfully deploy", async () => {
      let receipt = await marketRegistry.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
    it("shoud fail to deploy when quote token is not contract", async () => {
      await expect(upgrades.deployProxy(MarketRegistry, [ZERO_ADDR])).to.be.revertedWith(
        "MR_QTNC",
      );
    });
    it("shoud fail to initilaize again", async () => {
      await expect(marketRegistry.initialize(virtualToken.address)).to.be.revertedWith(
        "Initializable: contract is already initialized",
      );
    });
  });
  describe("setters", async () => {
    it("should  fail to set taker fees ration", async () => {
      await expect(marketRegistry.setTakerFeeRatio("100000000")).to.be.revertedWith("MR_RO");
    });
    it("should  fail to set taker fees ration", async () => {
      await expect(marketRegistry.setMakerFeeRatio("100000000")).to.be.revertedWith("MR_RO");
    });
    it("should set max order per market", async () => {
      await marketRegistry.setMaxOrdersPerMarket("125");
      const maxOrderPerpMarket = await marketRegistry.getMaxOrdersPerMarket();
      expect(maxOrderPerpMarket.toString()).to.be.equal("125");
    });
    it("should fail set max order oper market", async () => {
      await expect(
        marketRegistry.connect(account2).setMaxOrdersPerMarket("125"),
      ).to.be.revertedWith("MarketRegistry: Not admin");
    });
    it("should set positioning", async () => {
      await marketRegistry.setPositioning(account1.address);
      const positioning = await marketRegistry.getPositioning();
      expect(positioning).to.be.equal(account1.address);
    });
    it("should fail to set positioning", async () => {
      await expect(
        marketRegistry.connect(account2).setPositioning(account1.address),
      ).to.be.revertedWith("PositioningCallee: Not admin");
    });
    it("should not add base token if already added", async () => {
      const receipt = await marketRegistry.addBaseToken(volmexBaseToken.address);
      expect(receipt.value.toString()).to.be.equal("0");
    });
    it("should fail to  add base token is token is not base", async () => {
      await expect(marketRegistry.addBaseToken(virtualToken.address)).to.be.revertedWith(
        "MarketRegistry: not base token",
      );
    });
  });
});
