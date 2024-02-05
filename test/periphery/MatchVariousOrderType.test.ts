import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { BigNumber } from "ethers";
const { Order, Asset, sign, encodeAddress } = require("../order");
const { expectRevert } = require("@openzeppelin/test-helpers");

const convert = num => {
  const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
  return BigNumber.from(num).mul(one).toString();
};

describe("Various Order Types", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let Positioning;
  let positioning;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let AccountBalance;
  let PerpetualOracle;
  let perpetualOracle;
  let BaseToken;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let BaseToken;
  let BaseToken1;
  let BaseToken2;
  let BaseToken3;
  let QuoteToken;
  let QuoteToken;
  let PerpPeriphery;
  let PerpPeriphery;
  let PerpView;
  let perpView;
  let FundingRate;
  let fundingRate;
  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let TestERC20;
  let USDC;
  let owner, account1, account2;
  let liquidator;
  const deadline = 87654321987654;

  const ORDER = "0xf555eb98";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";

  this.beforeAll(async () => {
    PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    Positioning = await ethers.getContractFactory("Positioning");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    TestERC20 = await ethers.getContractFactory("TetherToken");
    BaseToken = await ethers.getContractFactory("BaseToken");
    QuoteToken = await ethers.getContractFactory("QuoteToken");
    PerpView = await ethers.getContractFactory("PerpView");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");
    FundingRate = await ethers.getContractFactory("FundingRate");
    [owner, account1, account2] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(PerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    BaseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
    await (await perpView.setBaseToken(BaseToken.address)).wait();

    BaseToken2 = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken2.deployed();
    await (await perpView.setBaseToken(BaseToken2.address)).wait();
    BaseToken3 = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken3.deployed();
    await (await perpView.setBaseToken(BaseToken3.address)).wait();
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          BaseToken.address,
          BaseToken.address,
          BaseToken2.address,
          BaseToken3.address,
        ],
        [100000000, 100000000, 30000000000, 1800000000],
        [100000000, 100000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [chainlinkAggregator1.address, chainlinkAggregator2.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );
    await BaseToken.setPriceFeed(perpetualOracle.address);
    QuoteToken = await upgrades.deployProxy(
      QuoteToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await QuoteToken.deployed();
    await (await perpView.setQuoteToken(QuoteToken.address)).wait();

    positioningConfig = await upgrades.deployProxy(PositioningConfig, [perpetualOracle.address]);

    USDC = await TestERC20.deploy("100000000000000000000000", "Tether USD", "USDT", 6);
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      perpetualOracle.address,
    ]);

    virtualToken = await upgrades.deployProxy(VirtualToken, ["VirtualToken", "VTK", false], {
      initializer: "initialize",
    });
    await virtualToken.deployed();

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [
      positioningConfig.address,
      [
        BaseToken.address,
        BaseToken.address,
        BaseToken2.address,
        BaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);
    await accountBalance1.deployed();
    await (await perpView.setAccount(accountBalance1.address)).wait();
    vaultController = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);
    await vaultController.deployed();
    await (await perpView.setVaultController(vaultController.address)).wait();

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
      vaultController.address,
    ]);
    await vault.deployed();
    await (await perpView.incrementVaultIndex()).wait();

    (await accountBalance1.grantSettleRealizedPnlRole(vault.address)).wait();
    (await accountBalance1.grantSettleRealizedPnlRole(vaultController.address)).wait();
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [
      QuoteToken.address,
      [
        BaseToken.address,
        BaseToken.address,
        BaseToken2.address,
        BaseToken3.address,
      ],
      [0, 1, chainlinkTokenIndex1, chainlinkTokenIndex2],
    ]);
    fundingRate = await upgrades.deployProxy(
      FundingRate,
      [perpetualOracle.address, positioningConfig.address, accountBalance1.address, owner.address],
      {
        initializer: "FundingRate_init",
      },
    );
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        fundingRate.address,
        marketRegistry.address,
        [
          BaseToken.address,
          BaseToken.address,
          BaseToken2.address,
          BaseToken3.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, account1.address],
        ["10000000000000000000", "10000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await marketRegistry.grantAddBaseTokenRole(owner.address);

    await (await perpView.setPositioning(positioning.address)).wait();
    await (await perpView.incrementPerpIndex()).wait();
    await (await BaseToken.setMintBurnRole(positioning.address)).wait();
    await (await QuoteToken.setMintBurnRole(positioning.address)).wait();

    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await perpetualOracle.grantSmaIntervalRole(positioningConfig.address);
    await positioningConfig.setPositioning(positioning.address);
    await positioningConfig.setAccountBalance(accountBalance1.address);
    await positioningConfig.connect(owner).setTwapInterval(28800);
    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig
      .connect(owner)
      .setSettlementTokenBalanceCap("100000000000000000000000");

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await perpetualOracle.setFundingRate(fundingRate.address)).wait();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await PerpPeriphery.deployed();
    await vaultController.setPeriphery(PerpPeriphery.address);
  });

  describe("Deposit, Withdraw & Open position", async () => {
    let index, amount, vBalBefore, orderLeft, orderRight, signatureLeft, signatureRight;

    this.beforeEach(async () => {
      index = 0;
      amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap("1000000000000000");
      await USDC.connect(owner).approve(PerpPeriphery.address, amount);

      vBalBefore = await USDC.balanceOf(vault.address);
      (await PerpPeriphery.depositToVault(index, USDC.address, amount)).wait();

      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(BaseToken.address, convert(10)),
        Asset(virtualToken.address, convert(20)),
        1,
        (1e6).toString(),
        true,
      );

      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert(20)),
        Asset(BaseToken.address, convert(10)),
        2,
        (1e6).toString(),
        false,
      );

      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "100000000000");
      await await USDC.transfer(account2.address, "100000000000");
      await USDC.connect(account1).approve(PerpPeriphery.address, "100000000000");
      await USDC.connect(account2).approve(PerpPeriphery.address, "100000000000");
      await PerpPeriphery.whitelistTrader(account1.address, true);
      await PerpPeriphery.whitelistTrader(account2.address, true);
      (
        await PerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "100000000000")
      ).wait();
      (
        await PerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "100000000000")
      ).wait();

      signatureLeft = await getSignature(orderLeft, account1.address);
      signatureRight = await getSignature(orderRight, account2.address);
    });

    it("Should open the position", async () => {
      // openPosition-1
      console.warn("\nopenPosition 0");
      await (
        await PerpPeriphery.openPosition(
          index,
          orderLeft,
          signatureLeft,
          orderRight,
          signatureRight,
          liquidator,
        )
      ).wait();

      const orderLeft1 = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(virtualToken.address, convert(60)),
        Asset(BaseToken.address, convert(40)),
        4,
        (1e6).toString(),
        false,
      );
      const signatureLeft1 = await getSignature(orderLeft1, account1.address);

      const orderRight1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(BaseToken.address, convert(20)),
        Asset(virtualToken.address, convert(30)),
        3,
        (1e6).toString(),
        true,
      );
      const signatureRight1 = await getSignature(orderRight1, account2.address);
      console.warn("\nopenPosition 1");
      await (
        await PerpPeriphery.openPosition(
          index,
          orderLeft1,
          signatureLeft1,
          orderRight1,
          signatureRight1,
          liquidator,
        )
      ).wait();

      const orderRight2 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(BaseToken.address, convert(20)),
        Asset(virtualToken.address, convert(30)),
        5,
        (1e6).toString(),
        true,
      );
      const signatureRight2 = await getSignature(orderRight2, account2.address);
      console.warn("\nopenPosition 2");
      await (
        await PerpPeriphery.openPosition(
          index,
          orderLeft1,
          signatureLeft1,
          orderRight2,
          signatureRight2,
          liquidator,
        )
      ).wait();

      const orderRight3 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(BaseToken.address, convert(2)),
        Asset(virtualToken.address, convert(3)),
        5,
        (1e6).toString(),
        true,
      );
      const signatureRight3 = await getSignature(orderRight3, account2.address);
      console.warn("\nopenPosition 3 - Failed on V_PERP_M: nothing to fill");
      await expectRevert(
        PerpPeriphery.openPosition(
          index,
          orderLeft1,
          signatureLeft1,
          orderRight3,
          signatureRight3,
          liquidator,
        ),
        "V_PERP_M: nothing to fill",
      );
    });
  });

  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
