import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { smock } from "@defi-wonderland/smock";
import { parseUnits, zeroPad } from "ethers/lib/utils";
const { Order, Asset, sign, encodeAddress } = require("../order");
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
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;

  let accountBalance1;
  let MarketRegistry;
  let marketRegistry;
  let TestERC20;
  let USDC;
  let owner, account1, account2, account3, account4;
  let liquidator;
  const deadline = 87654321987654;
  const one = ethers.constants.WeiPerEther; // 1e18
  const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18

  const ORDER = "0xf555eb98";
  const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
  const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
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
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    [owner, account1, account2, account3, account4] = await ethers.getSigners();
    liquidator = encodeAddress(owner.address);
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

    markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, [[1000000], [volmexBaseToken.address]], {
      initializer: "initialize",
    });
    await markPriceOracle.deployed();
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
   vaultController  = await upgrades.deployProxy(VaultController, [positioningConfig.address, accountBalance1.address]);
    vaultController2 = await upgrades.deployProxy(VaultController, [
      positioningConfig.address,
      accountBalance1.address,
    ]);

    vault = await upgrades.deployProxy(Vault, [
      positioningConfig.address,
      accountBalance1.address,
      USDC.address,
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
    marketRegistry = await upgrades.deployProxy(MarketRegistry, [volmexQuoteToken.address]);

    await marketRegistry.connect(owner).addBaseToken(volmexBaseToken.address);
    await marketRegistry.connect(owner).setMakerFeeRatio(0.0004e6);
    await marketRegistry.connect(owner).setTakerFeeRatio(0.0009e6);

    await accountBalance1.connect(owner).setPositioning(positioning.address);

    await vault.connect(owner).setPositioning(positioning.address);
    await vault.connect(owner).setVaultController(vaultController.address);
    await vaultController.registerVault(vault.address, USDC.address);
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
          [vault.address, vault.address],
          owner.address,
          owner.address // replace with replayer address
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
                    [vault.address, vault.address],
                    owner.address,
                    owner.address // replace with relayer address
                ]
            );
            let receipt = await volmexPerpPeriphery.deployed();
            expect(receipt.confirmations).not.equal(0);
        });
        it("should fail to deploy VolmexPerpPeriphery", async () => {
        await expect(upgrades.deployProxy(
              VolmexPerpPeriphery, 
              [
                  [positioning.address, positioning2.address], 
                  [vaultController.address, vaultController2.address],
                  markPriceOracle.address,
                  [vault.address, vault.address],
                  ZERO_ADDR,
                  owner.address // replace with relayer address
              ]
          )).to.be.revertedWith("Admin can't be address(0)");
        });
        it("should fail to initialize again", async()=>{
          await expect( volmexPerpPeriphery.initialize([positioning.address, positioning2.address], 
            [vaultController.address, vaultController2.address],
            markPriceOracle.address,
            [vault.address, vault.address],
            owner.address,
            owner.address)).to.be.revertedWith("Initializable: contract is already initialized")
        })
        it("should fail to deploy VolmexPerpPeriphery since relayer address is 0", async () => {
          await expect(upgrades.deployProxy(
                VolmexPerpPeriphery, 
                [
                    [positioning.address, positioning2.address], 
                    [vaultController.address, vaultController2.address],
                    markPriceOracle.address,
                    [vault.address, vault.address],
                    owner.address,
                    ZERO_ADDR // replace with relayer address
                ]
            )).to.be.revertedWith("Relayer can't be address(0)");
          });
    });

    describe("set Relayer", function(){
      it("should set relayer",async () => {
       const [owner, account1] = await ethers.getSigners();
       expect (await volmexPerpPeriphery.setRelayer(account1.address)).to.emit(volmexPerpPeriphery,"RelayerUpdated").withArgs(owner.address,account1.address);
      })
      it("should fail to set relayer",async()=>{
        const [owner, account1] = await ethers.getSigners();
        await  expect(volmexPerpPeriphery.setRelayer('0x0000000000000000000000000000000000000000')).to.be.revertedWith("VolmexPerpPeriphery: Not relayer")
      }) 
    })
    describe("Add a vault to white list", function(){
      it("Add vault to white list",async () => {
        const vault1 = await upgrades.deployProxy(Vault, [
          positioningConfig.address,
          accountBalance1.address,
          USDC.address,
          accountBalance1.address,
          false,
        ]);
       expect (await volmexPerpPeriphery.whitelistVault(vault1.address, true)).to.emit(volmexPerpPeriphery,"VaultWhitelisted").withArgs(vault1.address,true);
      })
    })

    describe("Set MarkPriceOracle", async () => {
      it("should set MarkPriceOracle", async () => {
          let receipt = await volmexPerpPeriphery.setMarkPriceOracle(markPriceOracle.address);
          expect(receipt.confirmations).not.equal(0);
      });

      it("should fail to set MarkPriceOracle if not admin", async () => {
          await expect(
              volmexPerpPeriphery.connect(account2).setMarkPriceOracle(markPriceOracle.address)
          ).to.be.revertedWith("Periphery: Not admin");
      });
    });

    describe("Fill Limit order", async () => {
      it("should fill LimitOrder", async () => {
        const orderLeft = Order(
          STOP_LOSS_LIMIT_ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, one.toString()),
          Asset(virtualToken.address, one.toString()),
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
            owner.address,
            0
        );
        expect(receipt.confirmations).not.equal(0);
      });
      it("should fill LimitOrder", async () => {
        const orderLeft = Order(
          ORDER,
          deadline,
          account1.address,
          Asset(volmexBaseToken.address, one.toString()),
          Asset(virtualToken.address, one.toString()),
          1,
          1e8.toString(),
          true,
        )
        
        const orderRight = Order(
          ORDER,
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
          owner.address,
          0
      );
      expect(receipt.confirmations).not.equal(0);
    })
      it("should fail to add order",async()=>{
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

        await expect(volmexPerpPeriphery.connect(account1).fillLimitOrder(
            orderLeft,
            signatureLeftLimitOrder,
            orderRight,
            signatureRightLimitOrder,
            owner.address,
            0
        )).to.be.revertedWith("VolmexPerpPeriphery: Not relayer")
      })
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
            owner.address,
            0
          )
        ).to.be.revertedWith("Periphery: left order price verification failed");
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
            owner.address,
            0
          )
        ).to.be.revertedWith("Periphery: right order price verification failed");
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
            owner.address,
            0
          )
        ).to.be.revertedWith("Periphery: left order price verification failed");
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
            owner.address,
            0
          )
        ).to.be.revertedWith("Periphery: right order price verification failed");
      });
    });

  describe("Add positioning", async () => {
    it("should add another Positioning", async () => {
      let receipt = await volmexPerpPeriphery.addPositioning(positioning.address);
      expect(receipt.confirmations).not.equal(0);
    });
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
        "Periphery: Not admin",
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
      ).to.be.revertedWith("Periphery: Not admin");
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
    it("should fail to update vault controller ",async()=>{
      const vaultControllerx = await upgrades.deployProxy(VaultController, [
        positioningConfig.address,
        accountBalance1.address,
      ]);
      const vaultControllery = await upgrades.deployProxy(VaultController, [
        positioningConfig.address,
        accountBalance1.address,
      ]);
      await expect(volmexPerpPeriphery.updateVaultControllerAtIndex(vaultControllerx.address,vaultControllery.address,0)).to.be.revertedWith("Periphery: Incorrect vault controller _index")
  
    })
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
    it("Should fail to update the positioning at index", async () => {
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
      await expect( volmexPerpPeriphery.updatePositioningAtIndex(oldPositioning, newPositioning.address, 2))
      .to.be.revertedWith("Periphery: Incorrect positioning _index")
      
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

      await positioningConfig.setSettlementTokenBalanceCap("1000000000000000");
      await USDC.connect(owner).approve(volmexPerpPeriphery.address, amount);

      vBalBefore = await USDC.balanceOf(vault.address);
      (await volmexPerpPeriphery.depositToVault(index, USDC.address, amount)).wait();
    });
    it("Should deposit the collateral to the vault", async () => {
      vBalAfter = await USDC.balanceOf(vault.address);
      expect(amount).to.equal(vBalAfter.sub(vBalBefore));
    });
    it("Should withdraw the collateral from the vault", async () => {
      ownerBalBeforeWithdraw = await USDC.balanceOf(owner.address);
      (await volmexPerpPeriphery.withdrawFromVault(index, USDC.address, owner.address, amount)).wait();
      vBalAfterWithdraw = await USDC.balanceOf(vault.address);
      ownerBalAfterWithdraw = await USDC.balanceOf(owner.address);
      expect(amount).to.equal(vBalAfter.sub(vBalAfterWithdraw));
      expect(amount).to.equal(ownerBalAfterWithdraw.sub(ownerBalBeforeWithdraw));
    });
    it("Should fail to tranfer to vault becuase vault address in not white listed",async()=>{
      await expect(volmexPerpPeriphery.connect(account2).transferToVault(USDC.address,owner.address,"10000000")).to.be.revertedWith("Periphery: vault not whitelisted")
    })
    let orderLeft;
    let orderRight;
    const deadline = 87654321987654;
    const one = ethers.constants.WeiPerEther; // 1e18
    const two = ethers.constants.WeiPerEther.mul(BigNumber.from("2")); // 2e18
    this.beforeEach(async () => {
      orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        1e6.toString(),
        true,
      )
  
      orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        2,
        1e6.toString(),
        false,
      )
    });
    
    it("Should open the position", async () => {
      await matchingEngine.grantMatchOrders(positioning.address);

      await (await USDC.transfer(account1.address, "100000000"));
      await (await USDC.transfer(account2.address, "100000000"));
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "100000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "100000000");
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, USDC.address, "100000000")).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, USDC.address, "100000000")).wait();

      let signatureLeft = await getSignature(orderLeft, account1.address);
      let signatureRight = await getSignature(orderRight, account2.address);

      // opening the positions here
      await expect(
        volmexPerpPeriphery.openPosition(index, orderLeft, signatureLeft, orderRight, signatureRight, liquidator),
      ).to.emit(positioning, "PositionChanged");

      const positionSize = await accountBalance1.getTakerPositionSize(
        account1.address,
        orderLeft.makeAsset.virtualToken,
      );
      const positionSize1 = await accountBalance1.getTakerPositionSize(
        account2.address,
        orderLeft.makeAsset.virtualToken,
      );

      expect(positionSize).to.be.equal("-2000000000000000000");
      expect(positionSize1).to.be.equal("2000000000000000000");
    });
    describe("Bulk Methods",function(){
    it("should open position in batch", async()=>{
      const ordersLeft = []
      const ordersRight = []
      const signaturesLeft = []
      const signaturesRight = []
      await matchingEngine.grantMatchOrders(positioning.address);
      await (await USDC.transfer(account1.address, "1000000000"));
      await (await USDC.transfer(account2.address, "1000000000"));
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, USDC.address, "1000000000")).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, USDC.address, "1000000000")).wait();
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        1e6.toString(),
        true,
      )
      ordersLeft.push(orderLeft)
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        2,
        1e6.toString(),
        false,
      )
      ordersRight.push(orderRight);
      const signatureLeft = await getSignature(orderLeft, account1.address);
      signaturesLeft.push(signatureLeft);
  
      const signatureRight = await getSignature(orderRight, account2.address);
      signaturesRight.push(signatureRight);
      await volmexPerpPeriphery.batchOpenPosition(index, ordersLeft,signaturesLeft,ordersRight,signaturesRight,liquidator)
      });
    it(" should fill limit order in batch",async()=>{
      const limitOrdersLeft = []
      const limitOrdersRight = []
      const signaturesLeft = []
      const signaturesRight = []
      await (await USDC.transfer(account1.address, "1000000000"));
      await (await USDC.transfer(account2.address, "1000000000"));
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, USDC.address, "1000000000")).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, USDC.address, "1000000000")).wait();
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
      limitOrdersLeft.push(orderLeft);
      limitOrdersRight.push(orderRight);
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      signaturesLeft.push(signatureLeft);
      signaturesRight.push(signatureRight);
      await matchingEngine.grantMatchOrders(positioning.address);
      await matchingEngine.grantMatchOrders(positioning2.address);
      await volmexPerpPeriphery.batchFillLimitOrders(index,limitOrdersLeft,signaturesLeft,limitOrdersRight,signaturesRight,liquidator);

    })
    it("should fail to fill batch orders",async()=>{
      const limitOrdersLeft = []
      const limitOrdersRight = []
      const signaturesLeft = []
      const signaturesRight = []
      await (await USDC.transfer(account1.address, "1000000000"));
      await (await USDC.transfer(account2.address, "1000000000"));
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, USDC.address, "1000000000")).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, USDC.address, "1000000000")).wait();
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
      limitOrdersLeft.push(orderLeft);
      limitOrdersRight.push(orderRight);
      const signatureLeft = await getSignature(orderLeft, account1.address);
      const signatureRight = await getSignature(orderRight, account2.address);
      signaturesLeft.push(signatureLeft);
      signaturesRight.push(signatureRight);
      limitOrdersLeft.push(orderLeft);
      await matchingEngine.grantMatchOrders(positioning.address);
      await matchingEngine.grantMatchOrders(positioning2.address);
      await expect(volmexPerpPeriphery.batchFillLimitOrders(index,limitOrdersLeft,signaturesLeft,limitOrdersRight,signaturesRight,liquidator))
      .to.be.revertedWith("Periphery: mismatch limit orders");

    })
    it("should fail to open position in batch",async()=>{
      const ordersLeft = []
      const ordersRight = []
      const signaturesLeft = []
      const signaturesRight = []
      await matchingEngine.grantMatchOrders(positioning.address);
      await (await USDC.transfer(account1.address, "1000000000"));
      await (await USDC.transfer(account2.address, "1000000000"));
      await USDC.connect(account1).approve(volmexPerpPeriphery.address, "1000000000");
      await USDC.connect(account2).approve(volmexPerpPeriphery.address, "1000000000");
      (await volmexPerpPeriphery.connect(account1).depositToVault(index, USDC.address, "1000000000")).wait();
      (await volmexPerpPeriphery.connect(account2).depositToVault(index, USDC.address, "1000000000")).wait();
      const orderLeft = Order(
        ORDER,
        deadline,
        account1.address,
        Asset(volmexBaseToken.address, two.toString()),
        Asset(virtualToken.address, two.toString()),
        1,
        1e6.toString(),
        true,
      )
      ordersLeft.push(orderLeft)
      const orderRight = Order(
        ORDER,
        deadline,
        account2.address,
        Asset(virtualToken.address, two.toString()),
        Asset(volmexBaseToken.address, two.toString()),
        2,
        1e6.toString(),
        false,
      )
      ordersRight.push(orderRight);
      ordersRight.push(orderRight);
      const signatureLeft = await getSignature(orderLeft, account1.address);
      signaturesLeft.push(signatureLeft);
  
      const signatureRight = await getSignature(orderRight, account2.address);
      signaturesRight.push(signatureRight);
      await expect( volmexPerpPeriphery.batchOpenPosition(index, ordersLeft,signaturesLeft,ordersRight,signaturesRight,liquidator)).to.be.revertedWith("Periphery: mismatch orders")
      
    });
  })
  })
    async function getSignature(orderObj, signer) {
      return sign(orderObj, signer, positioning.address);
    }
  });
  
