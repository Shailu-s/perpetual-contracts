import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe.only('MarkPriceOracle', function () {
  let MarkPriceOracle;
  let markPriceOracle;
  let ExchangeTest;
  let exchangeTest;
  let factory;
  let PerpFactory;
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
  let VaultController;
  let vaultController;
  let Vault;
  let vault;
  let Positioning;
  let positioning;
  let AccountBalance;
  let accountBalance;
  let TestERC20;
  let USDC;
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000'
  this.beforeAll(async () => {
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
    ExchangeTest = await ethers.getContractFactory("ExchangeTest");
    PerpFactory = await ethers.getContractFactory("PerpFactory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest");
    VaultController = await ethers.getContractFactory("VaultController");
    Vault = await ethers.getContractFactory("Vault");
    Positioning = await ethers.getContractFactory("Positioning");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    TestERC20 = await ethers.getContractFactory("TestERC20");

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

    volmexBaseToken = await VolmexBaseToken.deploy();
    await volmexBaseToken.deployed();

    newToken = await VolmexBaseToken.deploy();
    await newToken.deployed();

    positioning = await Positioning.deploy()    
    await positioning.deployed();

    accountBalance = await AccountBalance.deploy()
    await accountBalance.deployed();

    vault = await Vault.deploy()
    await vault.deployed();

    vaultController = await VaultController.deploy();
    await vaultController.deployed();

    factory = await upgrades.deployProxy(
      PerpFactory,
      [
        volmexBaseToken.address,
        vaultController.address,
        vault.address,
        positioning.address,
        accountBalance.address
      ],
      {
        initializer: "initialize"
      }
    );
    await factory.deployed();

    markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, 
      [
        [1000000],
        [volmexBaseToken.address]
      ],
      { 
        initializer: "initialize",
      }
    );
    await markPriceOracle.deployed();

    USDC = await TestERC20.deploy()
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6)
    await USDC.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, 
      [
        owner.address,
        markPriceOracle.address,
      ],
      {
        initializer: "__MatchingEngineTest_init"
      }
    );
    
    await matchingEngine.deployed();
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
      expect(Number(txn)).equal(9100000);
    });

    it("Should add multiple observations", async () => {
      await matchingEngine.addAssets([10000000, 20000000], [volmexBaseToken.address, USDC.address]);

      const txn = await markPriceOracle.getCumulativePrice(10000000, 0);
      expect(Number(txn)).equal(1000000);
    });
    it("should fail to add observation when cumulative price is zero ", async()=>{
      await expect(matchingEngine.addObservation(0,0)).to.be.revertedWith("MarkSMA: Not zero")
    })
    it("Should fail to add observation when caller is not exchange", async () => {
      await expect(
        markPriceOracle.addObservation(1000000, 0)
      ).to.be.revertedWith("MPO_NCAO");
    });

    it("Should get cumulative price", async () => {
      await matchingEngine.addAssets([10000000, 20000000], [volmexBaseToken.address, USDC.address]);
      const txn = await markPriceOracle.getCumulativePrice(1000000, 0);
      expect(Number(txn)).equal(1000000);
    });
    it("Should fail to  add multiple observations because uneuqal length of inputs", async () => {
      await expect(matchingEngine.addAssets([10000000, 20000000], [volmexBaseToken.address])).to.be.revertedWith("MarkSMA: Unequal length of prices & assets")

      
    });
    it("Should fail to  add multiple observations because 0 address of a token", async () => {
      await expect(matchingEngine.addAssets([10000000, 20000000], [volmexBaseToken.address,ZERO_ADDR])).to.be.revertedWith("MarkSMA: Asset address can't be 0")
    });
    it("should fail to set Matching engine as admin assecc is not provided",async() =>{
      const [owner, account1] = await ethers.getSigners();
      await expect(markPriceOracle.connect(account1).setMatchingEngine(MatchingEngine.address)).to.be.revertedWith("MarkPriceOracle: Not admin")
    })
    it("should fail to set Matching engine as admin assecc is not provided",async() =>{
      const [owner, account1] = await ethers.getSigners();
      await expect(markPriceOracle.connect(account1).setMatchingEngine(ZERO_ADDR)).to.be.revertedWith("V_PERP_M: Can't be 0 address");
    })
  });
  
});
