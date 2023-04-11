import { expect } from "chai";
import { Signer } from "ethers";
import { ethers, upgrades } from "hardhat";
const { expectRevert } = require("@openzeppelin/test-helpers");

describe("PerpFactory", function () {
  let MatchingEngine;
  let matchingEngine;
  let MarkPriceOracle;
  let markPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let VolmexQuoteToken;
  let volmexQuoteToken;
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
  let VolmexPerpView;
  let perpView;
  let MarketRegistry;
  let marketRegistry;
  let owner, alice;
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";

  this.beforeAll(async () => {
    MatchingEngine = await ethers.getContractFactory("MatchingEngine");
    PerpFactory = await ethers.getContractFactory("PerpFactory");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    VolmexQuoteToken = await ethers.getContractFactory("VolmexQuoteToken");
    VirtualTokenTest = await ethers.getContractFactory("VirtualTokenTest");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    VaultController = await ethers.getContractFactory("VaultController");
    PositioningConfig = await ethers.getContractFactory("PositioningConfig");
    AccountBalance = await ethers.getContractFactory("AccountBalance");
    Positioning = await ethers.getContractFactory("Positioning");
    Vault = await ethers.getContractFactory("Vault");
    TestERC20 = await ethers.getContractFactory("TestERC20");
    VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
    MarketRegistry = await ethers.getContractFactory("MarketRegistry");
  });

  beforeEach(async () => {
    [owner, alice] = await ethers.getSigners();

    perpView = await upgrades.deployProxy(VolmexPerpView, [owner.address]);
    await perpView.deployed();
    await (await perpView.grantViewStatesRole(owner.address)).wait();

    volmexBaseToken = await VolmexBaseToken.deploy();
    await volmexBaseToken.deployed();
    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
    await indexPriceOracle.setObservationAdder(owner.address);
    volmexQuoteToken = await VolmexQuoteToken.deploy();
    await volmexQuoteToken.deployed();

    USDC = await TestERC20.deploy();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);
    await USDC.deployed();

    marketRegistry = await MarketRegistry.deploy();
    marketRegistry.initialize(USDC.address);
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[100000], [volmexBaseToken.address], [proofHash], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    await markPriceOracle.deployed();

    matchingEngine = await upgrades.deployProxy(MatchingEngine, [
      owner.address,
      markPriceOracle.address,
    ]);
    await matchingEngine.deployed();

    positioningConfig = await PositioningConfig.deploy();
    await positioningConfig.deployed();

    accountBalance = await AccountBalance.deploy();
    await accountBalance.deployed();

    positioning = await Positioning.deploy();
    await positioning.deployed();
    // await positioning.setPositioning(positioning.address);

    vault = await Vault.deploy();
    await vault.deployed();

    vaultController = await VaultController.deploy();
    await vaultController.deployed();

    factory = await upgrades.deployProxy(
      PerpFactory,
      [
        volmexBaseToken.address,
        volmexQuoteToken.address,
        vaultController.address,
        vault.address,
        positioning.address,
        accountBalance.address,
        perpView.address,
        marketRegistry.address,
      ],
      {
        initializer: "initialize",
      },
    );
    await factory.deployed();
    await (await perpView.grantViewStatesRole(factory.address)).wait();

    virtualTokenTest = await upgrades.deployProxy(
      VirtualTokenTest,
      ["VirtualToken", "VTK", true],
      {
        initializer: "initialize",
      },
    );
    await virtualTokenTest.deployed();
  });

  it("Should deploy the PerpFactory", async () => {
    const receipt = await factory.deployed();
    expect(receipt.confirmations).not.equal(0);
  });
  it("should fail to initialize again", async () => {
    await expect(
      factory.initialize(
        volmexBaseToken.address,
        volmexQuoteToken.address,
        vaultController.address,
        vault.address,
        positioning.address,
        accountBalance.address,
        perpView.address,
        marketRegistry.address,
      ),
    ).to.be.revertedWith("Initializable: contract is already initialized");
  });

  describe("PerpView", async () => {
    it("Should fail to initialize", async () => {
      await expectRevert(
        perpView.initialize(owner.address),
        "Initializable: contract is already initialized",
      );
    });
    it("Should fail to set state role", async () => {
      await expectRevert(
        perpView.connect(alice).grantViewStatesRole(owner.address),
        "VolmexPerpView: Not admin",
      );
    });
    it("Should fail to call view role methods", async () => {
      await expectRevert(
        perpView.connect(alice).incrementVaultIndex(),
        "VolmexPerpView: Not state update caller",
      );
    });
  });

  describe("Clone:", function () {
    it("Should set token implementation contract correctly", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const tokenImplementation = await factory.baseTokenImplementation();
      expect(tokenImplementation).equal(volmexBaseToken.address);
    });

    it("Should set token implementation contract correctly", async () => {
      await factory.cloneQuoteToken("VQuote", "VQT");
      const tokenImplementation = await factory.quoteTokenImplementation();
      expect(tokenImplementation).equal(volmexQuoteToken.address);
    });

    it("Should set vault controller implementation contract correctly", async () => {
      const vaultControllerImplementation = await factory.vaultControllerImplementation();
      expect(vaultControllerImplementation).equal(vaultController.address);
    });

    it("Should clone base token", async () => {
      await factory.cloneBaseToken("MyTestToken", "MTK", indexPriceOracle.address);
      const cloneTokenAddress = await perpView.baseTokens(0);
      expect(cloneTokenAddress).not.equal(ZERO_ADDR);
    });

    it("should clone Quote token", async () => {
      await factory.cloneQuoteToken("GoatToken", "GTK");
      const cloneQuoteToken = await perpView.quoteTokens(0);
      expect(cloneQuoteToken).not.equal(ZERO_ADDR);
    });

    it("Should deploy the complete perp ecosystem", async () => {
      const index = (await perpView.perpIndexCount()).toString();
      await factory.clonePerpEcosystem(
        positioningConfig.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        volmexQuoteToken.address,
        index,
        [owner.address, alice.address],
      );
    });

    it("Should set market registry", async () => {
      const index = (await perpView.perpIndexCount()).toString();
      expect(
        await factory.clonePerpEcosystem(
          positioningConfig.address,
          matchingEngine.address,
          markPriceOracle.address,
          indexPriceOracle.address,
          volmexQuoteToken.address,
          index,
          [owner.address, alice.address],
        ),
      )
        .to.emit(factory, "")
        .withArgs(
          index + 1,
          await perpView.positionings(index),
          await perpView.vaultControllers(index),
          await perpView.accounts(index),
          await perpView.marketRegistries(index),
        );
    });

    it("Should Clone Vault", async () => {
      const index = (await perpView.perpIndexCount()).toString();
      await factory.clonePerpEcosystem(
        positioningConfig.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        volmexQuoteToken.address,
        index,
        [owner.address, alice.address],
      );
      const vaultClone = await factory.cloneVault(
        USDC.address,
        true,
        positioningConfig.address,
        accountBalance.address,
        vault.address,
        0,
      );
    });

    it("should fail to clone vault because or admin access ", async () => {
      const [owner, account1] = await ethers.getSigners();
      const index = (await perpView.perpIndexCount()).toString();
      await expect(
        factory
          .connect(account1)
          .clonePerpEcosystem(
            positioningConfig.address,
            matchingEngine.address,
            markPriceOracle.address,
            indexPriceOracle.address,
            volmexQuoteToken.address,
            index,
            [owner.address, alice.address],
          ),
      ).to.be.revertedWith("PF_NCD");
    });

    it("Should fail to Clone Vault", async () => {
      const index = (await perpView.perpIndexCount()).toString();
      await factory.clonePerpEcosystem(
        positioningConfig.address,
        matchingEngine.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        volmexQuoteToken.address,
        index,
        [owner.address, alice.address],
      );
      await expect(
        factory.cloneVault(
          USDC.address,
          true,
          positioningConfig.address,
          accountBalance.address,
          vault.address,
          1,
        ),
      ).to.be.revertedWith("PerpFactory: Vault Controller Not Found");
    });
  });

  describe("Price Feed", async () => {
    let newVolmexBaseToken;
    this.beforeEach(async () => {
      newVolmexBaseToken = await upgrades.deployProxy(
        VolmexBaseToken,
        [
          "VolmexBaseToken", // nameArg
          "VBT", // symbolArg,
          indexPriceOracle.address, // priceFeedArg
          true
        ],
        {
          initializer: "initialize",
        },
      );
    });

    it("Should update the priceFeed", async () => {
      const [owner] = await ethers.getSigners();

      let newIndexPriceOracle = await upgrades.deployProxy(
        IndexPriceOracle,
        [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
        {
          initializer: "initialize",
        },
      );

      await expect(newVolmexBaseToken.setPriceFeed(newIndexPriceOracle.address))
        .to.emit(newVolmexBaseToken, "PriceFeedChanged")
        .withArgs(newIndexPriceOracle.address);
    });

    it("Should return the current priceFeed", async () => {
      const priceFeed = await newVolmexBaseToken.getPriceFeed();
      expect(priceFeed).to.equal(indexPriceOracle.address);
    });
  });

  describe("Index Price", () => {
    it("Should return the current index price", async () => {
      await indexPriceOracle.addObservation(250000000, 0, proofHash);
      const newVolmexBaseToken = await upgrades.deployProxy(
        VolmexBaseToken,
        [
          "VolmexBaseToken", // nameArg
          "VBT", // symbolArg,
          indexPriceOracle.address, // priceFeedArg
          true,
        ],
        {
          initializer: "initialize",
        },
      );

      const volmexBaseTokenIndexPrice = await newVolmexBaseToken.getIndexPrice(0);
      const priceFeedIndexPrice = await indexPriceOracle.latestRoundData(28800, 0);
      expect(volmexBaseTokenIndexPrice).to.equal(priceFeedIndexPrice.answer);
    });
  });

  describe("Virtual Token", () => {
    describe("Deployment", () => {
      it("Should deploy VirtualToken", async () => {
        virtualTokenTest = await upgrades.deployProxy(
          VirtualTokenTest,
          ["VirtualToken", "VTK", true],
          {
            initializer: "initialize",
          },
        );

        let receipt = await virtualTokenTest.deployed();
        expect(receipt.confirmations).not.equal(0);
      });
    });

    describe("Mint", () => {
      it("Should mint max tokens to account", async () => {
        const [owner, account1] = await ethers.getSigners();

        await expect(virtualTokenTest.mintMaximumTo(account1.address))
          .to.emit(virtualTokenTest, "Transfer")
          .withArgs(
            ZERO_ADDR,
            account1.address,
            "115792089237316195423570985008687907853269984665640564039457584007913129639935", // type(uint256).max
          );
      });
    });
  });
});
