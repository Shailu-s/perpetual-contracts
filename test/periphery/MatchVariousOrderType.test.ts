import { ethers, upgrades } from "hardhat";
import { parseUnits } from "ethers/lib/utils";
import { BigNumber } from "ethers";
const { Order, Asset, sign, encodeAddress } = require("../order");
const { expectRevert } = require("@openzeppelin/test-helpers");

const convert = (num) => {
  const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
  return BigNumber.from(num).mul(one).toString();
}

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
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let VolmexPerpView;
  let perpView;
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

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
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
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    [owner, account1, account2] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
  });

  this.beforeEach(async () => {
    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();
    await (await perpView.setBaseToken(volmexBaseToken.address)).wait();

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
    volmexQuoteToken = await upgrades.deployProxy(
      VolmexQuoteToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        false, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexQuoteToken.deployed();
    await (await perpView.setQuoteToken(volmexQuoteToken.address)).wait();

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

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
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

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        perpetualOracle.address,
        0,
        [owner.address, account1.address],
      ],
      {
        initializer: "initialize",
      },
    );
    await positioning.deployed();
    await (await perpView.setPositioning(positioning.address)).wait();
    await (await perpView.incrementPerpIndex()).wait();
    await (await volmexBaseToken.setMintBurnRole(positioning.address)).wait();
    await (await volmexQuoteToken.setMintBurnRole(positioning.address)).wait();

    marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
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
    await positioning.connect(owner).setPositioning(positioning.address);

    await (await matchingEngine.grantMatchOrders(positioning.address)).wait();
    await (await perpetualOracle.setPositioning(positioning.address)).wait();

    await perpetualOracle.setMarkObservationAdder(matchingEngine.address);
    await perpetualOracle.setIndexObservationAdder(owner.address);
    await positioningConfig.connect(owner).setPositioning(positioning.address);
    await positioningConfig.connect(owner).setAccountBalance(accountBalance1.address);
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpView.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      owner.address, // replace with replayer address
    ]);
    await volmexPerpPeriphery.deployed();
  });

  describe("Deposit, Withdraw & Open position", async () => {
    let index, amount, vBalBefore, orderLeft, orderRight, signatureLeft, signatureRight;

    this.beforeEach(async () => {
      index = 0;
      amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap("1000000000000000");
      await USDC.connect(owner).approve(volmexPerpPeriphery.address, amount);

      vBalBefore = await USDC.balanceOf(vault.address);
      (await volmexPerpPeriphery.depositToVault(index, USDC.address, amount)).wait();

      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, convert(1)),
        Asset(virtualToken.address, convert(2)),
        1,
        (1e6).toString(),
        true,
      );

      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, convert(2)),
        Asset(volmexBaseToken.address, convert(1)),
        2,
        (1e6).toString(),
        false,
      );

      await matchingEngine.grantMatchOrders(positioning.address);

      await await USDC.transfer(account1.address, "100000000");
      await await USDC.transfer(account2.address, "100000000");
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000");
      await volmexPerpPeriphery.whitelistTrader(account1.address, true);
      await volmexPerpPeriphery.whitelistTrader(account2.address, true);
      (
        await volmexPerpPeriphery
          .connect(account1)
          .depositToVault(index, USDC.address, "100000000")
      ).wait();
      (
        await volmexPerpPeriphery
          .connect(account2)
          .depositToVault(index, USDC.address, "100000000")
      ).wait();

      signatureLeft = await getSignature(orderLeft, account1.address);
      signatureRight = await getSignature(orderRight, account2.address);
    });

    it("Should open the position", async () => {
      // openPosition-1
      console.warn("\nopenPosition 0");
      await (
        await volmexPerpPeriphery.openPosition(
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
        Asset(virtualToken.address, convert(6)),
        Asset(volmexBaseToken.address, convert(4)),
        4,
        (1e6).toString(),
        false,
      );
      const signatureLeft1 = await getSignature(orderLeft1, account1.address);

      const orderRight1 = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(volmexBaseToken.address, convert(2)),
        Asset(virtualToken.address, convert(3)),
        3,
        (1e6).toString(),
        true,
      );
      const signatureRight1 = await getSignature(orderRight1, account2.address);
      console.warn("\nopenPosition 1");
      await (
        await volmexPerpPeriphery.openPosition(
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
        Asset(volmexBaseToken.address, convert(2)),
        Asset(virtualToken.address, convert(3)),
        5,
        (1e6).toString(),
        true,
      );
      const signatureRight2 = await getSignature(orderRight2, account2.address);
      console.warn("\nopenPosition 2");
      await (
        await volmexPerpPeriphery.openPosition(
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
        Asset(volmexBaseToken.address, convert(2)),
        Asset(virtualToken.address, convert(3)),
        5,
        (1e6).toString(),
        true,
      );
      const signatureRight3 = await getSignature(orderRight3, account2.address);
      console.warn("\nopenPosition 3 - Failed on V_PERP_M: nothing to fill");
      await expectRevert(
        volmexPerpPeriphery.openPosition(
          index,
          orderLeft1,
          signatureLeft1,
          orderRight3,
          signatureRight3,
          liquidator,
        ),
        "V_PERP_M: nothing to fill"
      )
    });
  });

  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});