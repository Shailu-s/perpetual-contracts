import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";

describe('PerpFactory', function () {
  let VolmexBaseToken;
  let volmexBaseToken;
  let VirtualTokenTest;
  let virtualTokenTest;
  let PerpFactory;
  let factory;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VaultController;
  let vaultController;
  let PositioningConfig;
  let positioningConfig;
  let AccountBalance;
  let accountBalance;
  let Positioning;
  let positioning;
  let Vault;
  let vault;
  let TestERC20;
  let USDC;
  const ZERO_ADDR = '0x0000000000000000000000000000000000000000';

  this.beforeAll(async () => {
    PerpFactory = await ethers.getContractFactory("PerpFactory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VirtualTokenTest = await ethers.getContractFactory("VirtualTokenTest");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    VaultController = await ethers.getContractFactory("VaultController");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    Positioning = await ethers.getContractFactory("Positioning");
    Vault = await ethers.getContractFactory("Vault");
    TestERC20 = await ethers.getContractFactory("TestERC20");
  });

  beforeEach(async () => {
    const [owner] = await ethers.getSigners();

    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [
        owner.address,
      ],
      { 
        initializer: "initialize",
      }
    );
    await indexPriceOracle.deployed();

    volmexBaseToken = await VolmexBaseToken.deploy();
    await volmexBaseToken.deployed();

    USDC = await TestERC20.deploy()
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6)
    await USDC.deployed();

    positioningConfig = await PositioningConfig.deploy()
    await positioningConfig.deployed();

    accountBalance = await AccountBalance.deploy()
    await accountBalance.deployed();

    positioning = await Positioning.deploy()    
    await positioning.deployed();

    vault = await Vault.deploy()
    await vault.deployed();

    vaultController = await VaultController.deploy();
    await vaultController.deployed();

    factory = await upgrades.deployProxy(
      PerpFactory,
      [
        volmexBaseToken.address,
        vaultController.address
      ],
      {
        initializer: "initialize"
      }
    );
    await factory.deployed();

    virtualTokenTest = await upgrades.deployProxy(
      VirtualTokenTest,
      ["VirtualToken", "VTK"],
      {
        initializer: "initialize"
      }
    );
    await virtualTokenTest.deployed();
  });

  describe('Deployment:', function() {
    it("PerpFactory deployed confirm", async () => {
      factory = await upgrades.deployProxy(
        PerpFactory,
        [
          volmexBaseToken.address,
          vaultController.address
        ],
        {
          initializer: "initialize"
        }
      );

      let receipt = await factory.deployed();
      expect(receipt.confirmations).not.equal(0);
    });
  });

  describe('Clone:', function() {
    it("Should set token implementation contract correctly", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const tokenImplementation = await factory.tokenImplementation();
      expect(tokenImplementation).equal(volmexBaseToken.address);
    });

    it("Should set vault controller implementation contract correctly", async () => {
      const vaultControllerImplementation = await factory.vaultControllerImplementation();
      expect(vaultControllerImplementation).equal(vaultController.address);
    });

    it("Should clone base token", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const cloneTokenAddress = await factory.tokenByIndex(0);
      expect(cloneTokenAddress).not.equal(ZERO_ADDR);
    });

    it("Should clone vault controller", async () => {
      USDC = await TestERC20.deploy();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

      positioningConfig = await PositioningConfig.deploy();
      accountBalance = await AccountBalance.deploy();
      positioning = await Positioning.deploy();
      vault = await Vault.deploy();
      let vaultController = await factory.vaultControllersByIndex(0);
      expect(vaultController).to.equal(ZERO_ADDR);

      await factory.cloneVaultController(
        positioning.address,
        positioningConfig.address,
        accountBalance.address,
        vault.address,
      );
      vaultController = await factory.vaultControllersByIndex(0);
      expect(vaultController).not.equal(ZERO_ADDR);
    });

    it("Should deploy a new vault", async () => {
      await factory.cloneVaultController(
        positioning.address,
        positioningConfig.address,
        accountBalance.address,
        vault.address,
      );

      const vaultControllerAddr = await factory.vaultControllersByIndex(0);
      expect(vaultControllerAddr).not.equal(ZERO_ADDR);

      expect(
        await factory.cloneVault(
          USDC.address,
          true,
          positioning.address,
          accountBalance.address,
          vault.address,
          0
        ),
      ).to.emit(factory, "NewVaultCreated");
      
      let controllerInstance = await VaultController.attach(vaultControllerAddr);
      let newVault = await controllerInstance.getVault(USDC.address);
      expect(newVault).not.equal(ZERO_ADDR);
    });

    it("Should increment indexCount when cloning a new token", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      let cloneTokenIndexCount = await factory.tokenIndexCount();
      expect(cloneTokenIndexCount).equal(1);

      await factory.cloneBaseToken("AnotherToken", "ATK", indexPriceOracle.address);
      cloneTokenIndexCount = await factory.tokenIndexCount();
      expect(cloneTokenIndexCount).equal(2);
    });

    it("Should increment vaultControllerIndexCount when cloning a new vault controller", async () => {
      USDC = await TestERC20.deploy();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

      positioningConfig = await PositioningConfig.deploy();
      await positioningConfig.initialize();
      accountBalance = await AccountBalance.deploy();
      positioning = await Positioning.deploy();
      vault = await Vault.deploy();
      await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address, true);

      await factory.cloneVaultController(
        positioning.address,
        positioningConfig.address,
        accountBalance.address,
        vault.address,
      );
      const cloneVaultControllerAddr = await factory.vaultControllersByIndex(0);
      expect(cloneVaultControllerAddr).not.equal(ZERO_ADDR);

      let cloneVaultControllerIndexCount = await factory.vaultControllerIndexCount();
      expect(cloneVaultControllerIndexCount).equal(1);

      await factory.cloneVaultController(
        positioning.address,
        positioningConfig.address,
        accountBalance.address,
        vault.address,
      );
      cloneVaultControllerIndexCount = await factory.vaultControllerIndexCount();
      expect(cloneVaultControllerIndexCount).equal(2);
    });
  });

  describe('Price Feed', async () => {
    const newVolmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        indexPriceOracle.address, // priceFeedArg
      ],
      {
        initializer: "initialize",
      }
    );

    it("Should update the priceFeed", async () => {
      const [owner] = await ethers.getSigners();

      let newIndexPriceOracle = await upgrades.deployProxy(
        IndexPriceOracle,
        [owner.address],
        { 
          initializer: "initialize",
        }
      );

      await expect(newVolmexBaseToken.setPriceFeed(newIndexPriceOracle.address))
        .to.emit(newVolmexBaseToken, "PriceFeedChanged").withArgs(newIndexPriceOracle.address);
    });

    it("Should return the current priceFeed", async () => {
      const priceFeed = await newVolmexBaseToken.getPriceFeed();
      expect(priceFeed).to.equal(indexPriceOracle.address);
    });
  });

  describe('Index Price', () => {
    it("Should return the current index price", async () => {
      const newVolmexBaseToken = await upgrades.deployProxy(
        VolmexBaseToken,
        [
          "VolmexBaseToken", // nameArg
          "VBT", // symbolArg,
          indexPriceOracle.address, // priceFeedArg
        ],
        {
          initializer: "initialize",
        }
      );

      const volmexBaseTokenIndexPrice = await newVolmexBaseToken.getIndexPrice(0);
      const priceFeedIndexPrice = await indexPriceOracle.latestRoundData(0);
      expect(volmexBaseTokenIndexPrice).to.equal(priceFeedIndexPrice.answer);
    });
  });

  describe('Virtual Token', () => {
    describe('Deployment', () => {
      it("Should deploy VirtualToken", async () => {
        virtualTokenTest = await upgrades.deployProxy(
          VirtualTokenTest,
          ["VirtualToken", "VTK"],
          {
            initializer: "initialize"
          }
        );

        let receipt = await virtualTokenTest.deployed();
        expect(receipt.confirmations).not.equal(0);
      });
    });

    describe('Mint', () => {
      it("Should mint max tokens to account", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.mintMaximumTo(account1.address))
        .to.emit(virtualTokenTest, "Transfer").withArgs(
          ZERO_ADDR,
          account1.address,
          '115792089237316195423570985008687907853269984665640564039457584007913129639935' // type(uint256).max
        );
      });
    });

    describe('White list', () => {
      it("Should add account to white list", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );
      });

      it("Should return true if white listed account is present", async () => {
        const [owner, account1] = await ethers.getSigners();
        
        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );

        let isInWhitelist = await virtualTokenTest.isInWhitelist(account1.address);
        expect(isInWhitelist).to.equal(true);
      });

      it("Should return false if white listed account is not present", async () => {
        const [owner, account1] = await ethers.getSigners();

        let isInWhitelist = await virtualTokenTest.isInWhitelist(account1.address);
        expect(isInWhitelist).to.equal(false);
      });

      it("Should remove whitelisted account if account balance is 0", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );
        
        expect(await virtualTokenTest.removeWhitelist(account1.address))
          .to.emit(virtualTokenTest, "WhitelistRemoved")
          .withArgs(account1.address);
      });

      it("Should fail to remove whitelisted account if account balance is non-zero", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(account1.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          account1.address
        );

        await expect(virtualTokenTest.mintMaximumTo(account1.address))
        .to.emit(virtualTokenTest, "Transfer").withArgs(
          ZERO_ADDR,
          account1.address,
          '115792089237316195423570985008687907853269984665640564039457584007913129639935' // type(uint256).max
        );
        
        await expect(virtualTokenTest.removeWhitelist(account1.address))
          .to.be.revertedWith("VT_BNZ");
      });

      it("Should fail while calling token transfer when from address is not whitelisted", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(
          virtualTokenTest.beforeTokenTransfer(
            owner.address,
            account1.address,
            10,
          )
        ).to.be.revertedWith("VT_NW");
      });

      it("Should call before token transfer", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(owner.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          owner.address
        );

        let receipt = await virtualTokenTest.beforeTokenTransfer(
          owner.address,
          account1.address,
          10,
        );
        expect(receipt.confirmations).not.equal(0);
      });

      it("Should call before token transfer", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.addWhitelist(owner.address))
        .to.emit(virtualTokenTest, "WhitelistAdded").withArgs(
          owner.address
        );
        
        let receipt = await virtualTokenTest.beforeTokenTransfer(
          ZERO_ADDR,
          account1.address,
          10,
        );
        expect(receipt.confirmations).not.equal(0);
      });
    });
  });
});
