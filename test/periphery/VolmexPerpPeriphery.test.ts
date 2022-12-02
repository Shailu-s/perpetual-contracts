import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { smock } from "@defi-wonderland/smock";
import { parseUnits } from "ethers/lib/utils";
const { Order, Asset, sign } = require("../order");
import { BigNumber } from "ethers";

describe("VolmexPerpPeriphery", function () {
  let MatchingEngine;
  let matchingEngine;
  let VirtualToken;
  let virtualToken;
  let ERC20TransferProxyTest;
  let Positioning;
  let positioning;
  let positioning2;
  let PositioningConfig;
  let positioningConfig;
  let Vault;
  let vault;
  let VaultController;
  let vaultController;
  let vaultController2;
  let AccountBalance;
  let accountBalance;
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;

  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let BaseToken;
  let baseToken;
  let TestERC20;
  let USDC;
  let owner, account1, account2, account3, account4;
  const deadline = 87654321987654;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";

  this.beforeAll(async () => {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    VirtualToken = await ethers.getContractFactory("VirtualTokenTest");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    Positioning = await ethers.getContractFactory("PositioningTest");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    Vault = await ethers.getContractFactory("Vault");
    VaultController = await ethers.getContractFactory("VaultController");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    BaseToken = await ethers.getContractFactory("VolmexBaseToken");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
  });

  this.beforeEach(async () => {
    indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
      initializer: "initialize",
    });

    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.deployed();

    markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, [[1000000], [volmexBaseToken.address]], {
      initializer: "initialize",
    });
    await markPriceOracle.deployed();

    accountBalance = await smock.fake("AccountBalance");
    baseToken = await smock.fake("VolmexBaseToken");

    positioningConfig = await upgrades.deployProxy(PositioningConfig, []);

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
    await markPriceOracle.setMatchingEngine(matchingEngine.address);

    virtualToken = await upgrades.deployProxy(
      VirtualToken,
      ["VirtualToken", "VTK", false],
      {
        initializer: "initialize"
      }
    );
    await virtualToken.deployed();

    accountBalance1 = await upgrades.deployProxy(AccountBalance, [positioningConfig.address]);
    vaultController = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address]);
    vaultController2 = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      virtualToken.address,
      accountBalance1.address,
      false,
    ]);
    await vault.deployed();
    (await accountBalance1.grantSettleRealizedPnlRole(vault.address)).wait();
    (await accountBalance1.grantSettleRealizedPnlRole(vaultController.address)).wait();
    (await accountBalance1.grantSettleRealizedPnlRole(vaultController2.address)).wait();

    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
      ],
      {
        initializer: "initialize",
      },
    );

    positioning2 = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance1.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
      ],
      {
        initializer: "initialize",
      },
    );
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [virtualToken.address]);

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).addBaseToken(baseToken.address);
    await marketRegistry.connect(owner).addBaseToken(virtualToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, virtualToken.address);
    await vaultController.connect(owner).setPositioning(positioning.address);

    await positioningConfig.connect(owner).setMaxMarketsPerAccount(5);
    await positioningConfig.connect(owner).setSettlementTokenBalanceCap(1000000);

    await positioning.connect(owner).setMarketRegistry(marketRegistry.address);
    await positioning.connect(owner).setDefaultFeeReceiver(owner.address);
    await positioning.connect(owner).setPositioning(positioning.address);

    for (let i = 0; i < 9; i++) {
      await matchingEngine.addObservation(10000000, 0);
    }

    volmexPerpPeriphery = await upgrades.deployProxy(
      VolmexPerpPeriphery, 
      [
          [positioning.address, positioning2.address], 
          [vaultController.address, vaultController2.address],
          markPriceOracle.address,
          owner.address,
      ]
    );
  });

    describe("VolmexPerpPeriphery deployment", async () => {
        it("should deploy VolmexPerpPeriphery", async () => {
            volmexPerpPeriphery = await upgrades.deployProxy(
                VolmexPerpPeriphery, 
                [
                    [positioning.address, positioning2.address], 
                    [vaultController.address, vaultController2.address],
                    markPriceOracle.address,
                    owner.address,
                ]
            );
            let receipt = await volmexPerpPeriphery.deployed();
            expect(receipt.confirmations).not.equal(0);
        });
    });

    describe("Set MarkPriceOracle", async () => {
      it("should set MarkPriceOracle", async () => {
          let receipt = await volmexPerpPeriphery.setMarkPriceOracle(markPriceOracle.address);
          expect(receipt.confirmations).not.equal(0);
      });

      it("should fail to set MarkPriceOracle if not admin", async () => {
          await expect(
              volmexPerpPeriphery.connect(account2).setMarkPriceOracle(markPriceOracle.address)
          ).to.be.revertedWith("VolmexPerpPeriphery: Not admin");
      });
    });

    describe("Fill Limit order", async () => {
      it("should fill LimitOrder", async () => {
        const orderLeft = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          1e8.toString(),
          true,
        )
    
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, two.toString()),
          Asset(volmexBaseToken.address, two.toString()),
          1,
          1e6.toString(),
          false,
        )

        const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
        const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

        await matchingEngine.grantMatchOrders(positioning.address);
        await matchingEngine.grantMatchOrders(positioning2.address);

        let receipt = await volmexPerpPeriphery.fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            0
        );
        expect(receipt.confirmations).not.equal(0);
      });

      it("should fail to fill LimitOrder: Sell Stop Limit Order Trigger Price Not Matched", async () => {
        const orderLeft = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          1e6.toString(),
          true,
        )
    
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, two.toString()),
          Asset(volmexBaseToken.address, two.toString()),
          1,
          1e6.toString(),
          false,
        )

        const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
        const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

        await matchingEngine.grantMatchOrders(positioning.address);
        await matchingEngine.grantMatchOrders(positioning2.address);

        await expect(
          volmexPerpPeriphery.fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            0
          )
        ).to.be.revertedWith("Sell Stop Limit Order Trigger Price Not Matched");
      });

      it("should fail to fill LimitOrder: Buy Stop Limit Order Trigger Price Not Matched", async () => {
        const orderLeft = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          1e8.toString(),
          true,
        )
    
        const orderRight = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, two.toString()),
          Asset(volmexBaseToken.address, two.toString()),
          1,
          1e8.toString(),
          false,
        )

        const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
        const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

        await matchingEngine.grantMatchOrders(positioning.address);
        await matchingEngine.grantMatchOrders(positioning2.address);

        await expect(
          volmexPerpPeriphery.fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            0
          )
        ).to.be.revertedWith("Buy Stop Limit Order Trigger Price Not Matched");
      });

      it("should fail to fill LimitOrder: Sell Take-profit Limit Order Trigger Price Not Matched", async () => {
        const orderLeft = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          1e8.toString(),
          true,
        )
    
        const orderRight = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, two.toString()),
          Asset(volmexBaseToken.address, two.toString()),
          1,
          1e6.toString(),
          false,
        )

        const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
        const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

        await matchingEngine.grantMatchOrders(positioning.address);
        await matchingEngine.grantMatchOrders(positioning2.address);

        await expect(
          volmexPerpPeriphery.fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            0
          )
        ).to.be.revertedWith("Sell Take-profit Limit Order Trigger Price Not Matched");
      });

      it("should fail to fill LimitOrder: Buy Take-profit Limit Order Trigger Price Not Matched", async () => {
        const orderLeft = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, two.toString()),
          Asset(virtualToken.address, two.toString()),
          1,
          1e6.toString(),
          true,
        )
    
        const orderRight = Order(
          TAKE_PROFIT_LIMIT_ORDER,
          deadline,
          account2.address,
          Asset(virtualToken.address, two.toString()),
          Asset(volmexBaseToken.address, two.toString()),
          1,
          1e6.toString(),
          false,
        )

        const signatureLeftLimitOrder = await getSignature(orderLeft, account1.address);
        const signatureRightLimitOrder = await getSignature(orderRight, account2.address);

        await matchingEngine.grantMatchOrders(positioning.address);
        await matchingEngine.grantMatchOrders(positioning2.address);

        await expect(
          volmexPerpPeriphery.fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            0
          )
        ).to.be.revertedWith("Buy Take-profit Limit Order Trigger Price Not Matched");
      });
    });

    describe("Add positioning", async () => {
        it("should add another Positioning", async () => {
            let receipt = await volmexPerpPeriphery.addPositioning(positioning.address);
            expect(receipt.confirmations).not.equal(0);
        });
    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      [positioning.address, positioning2.address],
      [vaultController.address, vaultController2.address],
      owner.address,
    ]);
    await volmexPerpPeriphery.deployed();
  });

  describe("VolmexPerpPeriphery deployment", async () => {
    it("should deploy VolmexPerpPeriphery", async () => {
      let receipt = await volmexPerpPeriphery.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe("Add positioning", async () => {
    it("should add another Positioning", async () => {
      let receipt = await volmexPerpPeriphery.addPositioning(positioning.address);
      expect(receipt.confirmations).not.equal(0);
    });

    it("should fail to add another Positioning if not admin", async () => {
      await expect(volmexPerpPeriphery.connect(account2).addPositioning(positioning.address)).to.be.revertedWith(
        "VolmexPerpPeriphery: Not admin",
      );
    });
  });

  describe("Add vaultController", async () => {
    it("should add another VaultController", async () => {
      let receipt = await volmexPerpPeriphery.addVaultController(vaultController.address);
      expect(receipt.confirmations).not.equal(0);
    });

    it("should fail to add another VaultController if not admin", async () => {
      await expect(
        volmexPerpPeriphery.connect(account2).addVaultController(vaultController.address),
      ).to.be.revertedWith("VolmexPerpPeriphery: Not admin");
    });
  });

  describe("Update Vault controller and Positioning by index", async () => {
    it("Should update the vault controller at index", async () => {
      const controller = await upgrades.deployProxy(VaultController, [
        positioningConfig.address,
        accountBalance1.address,
      ]);
      const oldVaultController = await volmexPerpPeriphery.vaultControllers(0);
      await (await volmexPerpPeriphery.updateVaultControllerAtIndex(oldVaultController, controller.address, 0)).wait();
      expect(await volmexPerpPeriphery.vaultControllers(0)).to.equal(controller.address);
    });

    it("Should update the positioning at index", async () => {
      const newPositioning = await upgrades.deployProxy(Positioning, [
          positioningConfig.address,
          vaultController.address,
          accountBalance1.address,
          matchingEngine.address,
          markPriceOracle.address,
          indexPriceOracle.address,
          0,
      ]);
      const oldPositioning = await volmexPerpPeriphery.positionings(0);
      await (await volmexPerpPeriphery.updatePositioningAtIndex(oldPositioning, newPositioning.address, 0)).wait();
      expect(await volmexPerpPeriphery.positionings(0)).to.equal(newPositioning.address);
    });
  });

  describe("Deposit, Withdraw & Open position", async () => {
    let index;
    let amount;
    let vBalBefore;
    let vBalAfter;
    let vBalAfterWithdraw;
    let ownerBalBeforeWithdraw;
    let ownerBalAfterWithdraw;

    this.beforeEach(async () => {
      index = 0;
      amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap("10000000000000");

      await virtualToken.mint(owner.address, amount);
      await virtualToken.addWhitelist(owner.address);
      await virtualToken.approve(volmexPerpPeriphery.address, amount);

      vBalBefore = await virtualToken.balanceOf(vault.address);
      (await volmexPerpPeriphery.depositToVault(index, virtualToken.address, amount)).wait();
    });
    it("Should deposit the collateral to the vault", async () => {
      vBalAfter = await virtualToken.balanceOf(vault.address);
      expect(amount).to.equal(vBalAfter.sub(vBalBefore));
    });
    it("Should withdraw the collateral from the vault", async () => {
      ownerBalBeforeWithdraw = await virtualToken.balanceOf(owner.address);
      (await virtualToken.addWhitelist(vault.address)).wait();
      (await volmexPerpPeriphery.withdrawFromVault(index, virtualToken.address, owner.address, amount)).wait();
      vBalAfterWithdraw = await virtualToken.balanceOf(vault.address);
      ownerBalAfterWithdraw = await virtualToken.balanceOf(owner.address);
      expect(amount).to.equal(vBalAfter.sub(vBalAfterWithdraw));
      expect(amount).to.equal(ownerBalAfterWithdraw.sub(ownerBalBeforeWithdraw));
    });

    let orderLeft;
    let orderRight;
    const deadline = 87654321987654;
    const one = ethers.constants.WeiPerEther; // 1e18
    const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
    this.beforeEach(async () => {
      orderLeft = Order(
        account1.address,
        deadline,
        true,
        Asset(virtualToken.address, one.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        1,
      );

      orderRight = Order(
        account2.address,
        deadline,
        false,
        Asset(volmexBaseToken.address, one.toString()),
        Asset(virtualToken.address, two.toString()),
        2,
      );
    });
    it("Should open the position", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await virtualToken.mint(account1.address, 1000000000000000);
      await virtualToken.mint(account2.address, 1000000000000000);
      await virtualToken.addWhitelist(account1.address);
      await virtualToken.addWhitelist(account2.address);
      await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, 1000000000000000);
      await virtualToken.connect(account2).approve(volmexPerpPeriphery.address, 1000000000000000);
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, virtualToken.address, 25000)).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, virtualToken.address, 25000)).wait();

      let signatureLeft = await getSignature(orderLeft, account1.address);
      let signatureRight = await getSignature(orderRight, account2.address);

      // opening the positions here
      await expect(
        volmexPerpPeriphery.openPosition(index, orderLeft, signatureLeft, orderRight, signatureRight),
      ).to.emit(positioning, "PositionChanged");

      const positionSize = await accountBalance1.getTakerPositionSize(
        account1.address,
        orderLeft.makeAsset.virtualToken,
      );
      const positionSize1 = await accountBalance1.getTakerPositionSize(
        account2.address,
        orderLeft.makeAsset.virtualToken,
      );

      expect(positionSize).to.be.equal("-500000000000000000");
      expect(positionSize1).to.be.equal("500000000000000000");
    });
  });
  async function getSignature(orderObj, signer) {
    return sign(orderObj, signer, positioning.address);
  }
});
