import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { BigNumber } from "ethers";

describe("Market Registry", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let erc20TransferProxy;
  let ERC20TransferProxy;
  let TransferManagerTest;
  let ERC1271Test;
  let erc1271Test;

  let PositioningConfig;
  let positioningConfig;

  let AccountBalance;
  let accountBalance;

  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexPerpPeriphery;
  let PerpetualOracle;
  let perpetualOracle;
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
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
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

    baseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "BaseToken", // nameArg
        "BTN", // symbolArg,
        perpetualOracle.address, // priceFeedArg
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

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);
    await positioningConfig.deployed();
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    accountBalance = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken.address],
    ]);
    await accountBalance.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, perpetualOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);

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
      await expect(marketRegistry.setTakerFeeRatio("7000000")).to.be.revertedWith("MR_RO");
    });
    it("should  fail to set taker fees ration", async () => {
      await expect(marketRegistry.setMakerFeeRatio("7000000")).to.be.revertedWith("MR_RO");
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
