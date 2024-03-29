import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades, waffle } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";

describe("Vault", function () {
  let USDC;
  let positioningConfig;
  let accountBalance;
  let vault;
  let DAIVault;
  let ethVault;
  let vaultController;
  let vaultFactory;
  let DAI;
  let ETH;
  let PerpetualOracle;
  let perpetualOracle;
  let MatchingEngine;
  let matchingEngine;
  let Positioning;
  let positioning;
  let EthPositioning;
  let ethPositioning;
  let PerpPeriphery;
  let PerpPeriphery;
  let FundingRate;
  let fundingRate;
  let perpViewFake;
  let PerpPeripheryEth;
  let owner, alice, relayer, bob, cole;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const capRatio = "250";
  const twapType = "0x1444f8cf";

  beforeEach(async function () {
    PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
    [owner, alice, relayer, bob, cole] = await ethers.getSigners();
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    FundingRate = await ethers.getContractFactory("FundingRate");
    MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    perpViewFake = await smock.fake("PerpView");

    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const USDC1 = await tokenFactory.deploy();
    USDC = await USDC1.deployed();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();
    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 18);

    const tokenFactory3 = await ethers.getContractFactory("TestERC20");
    const eth = await tokenFactory3.deploy();
    ETH = await eth.deployed();
    await eth.__TestERC20_init("TestETH", "ETH", 18);
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [alice.address, alice.address, alice.address, alice.address],
        [10000000, 10000000, 10000000, 10000000],
        [10000000, 10000000],
        [proofHash, proofHash],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [alice.address, alice.address],
        owner.address,
      ],
      { initializer: "__PerpetualOracle_init" },
    );

    const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
    positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
      perpetualOracle.address,
    ]);
    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    matchingEngine = await upgrades.deployProxy(
      MatchingEngine,
      [owner.address, perpetualOracle.address],
      {
        initializer: "__MatchingEngineTest_init",
      },
    );
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
      [alice.address, alice.address, alice.address, alice.address],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngine.address,
      owner.address,
    ]);

    const vaultContractFactory = await ethers.getContractFactory("VaultController");
    vaultController = await upgrades.deployProxy(vaultContractFactory, [
      positioningConfig.address,
      accountBalance.address,
    ]);

    vaultFactory = await ethers.getContractFactory("Vault");
    vault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      USDC.address,
      vaultController.address,
    ]);
    DAIVault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      DAI.address,
      vaultController.address,
    ]);

    Positioning = await ethers.getContractFactory("PositioningTest");
    fundingRate = await upgrades.deployProxy(
      FundingRate,
      [perpetualOracle.address, positioningConfig.address, accountBalance.address, owner.address],
      {
        initializer: "FundingRate_init",
      },
    );
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        matchingEngine.address,
        perpetualOracle.address,
        fundingRate.address,
        accountBalance.address,
        [alice.address, alice.address, alice.address, alice.address],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, alice.address],
        ["1000000000000000000", "1000000000000000000"],
      ],
      {
        initializer: "initialize",
      },
    );
    await vaultController.connect(owner).setPositioning(positioning.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.registerVault(DAIVault.address, DAI.address);

    const amount = parseUnits("100000000000000000000", await USDC.decimals());
    await USDC.mint(alice.address, amount);
    await USDC.mint(bob.address, amount);
    await USDC.mint(cole.address, amount);
    await USDC.connect(alice).approve(vault.address, amount);
    await USDC.connect(bob).approve(vault.address, amount);
    await USDC.connect(cole).approve(vault.address, amount);
    await USDC.mint(owner.address, amount);

    const daiAmount = parseUnits("1000", await DAI.decimals());
    await DAI.mint(alice.address, daiAmount);
    await DAI.connect(alice).approve(DAIVault.address, daiAmount);

    await DAI.mint(owner.address, daiAmount);

    PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
      perpViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
    await vaultController.setPeriphery(PerpPeriphery.address);
  });
  describe("deployment", function () {
    it("should fail to deploy vault", async () => {
      const tokenFactory = await ethers.getContractFactory("TestERC20");

      const USDC1 = await tokenFactory.deploy();
      USDC = await USDC1.deployed();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 20);
      vaultFactory = await ethers.getContractFactory("Vault");
      await expect(
        upgrades.deployProxy(vaultFactory, [
          positioningConfig.address,
          accountBalance.address,
          USDC.address,
          vaultController.address,
        ]),
      ).to.be.revertedWith("V_ISTD");
    });
    it("should fail to deploy because  positioning config address was not contract", async () => {
      await expect(
        upgrades.deployProxy(vaultFactory, [
          alice.address,
          accountBalance.address,
          USDC.address,
          vaultController.address,
        ]),
      ).to.be.revertedWith("V_CHCNC");
    });
    it("should fail to deploy because  account balance address was not contract,", async () => {
      await expect(
        upgrades.deployProxy(vaultFactory, [
          positioningConfig.address,
          alice.address,
          USDC.address,
          vaultController.address,
        ]),
      ).to.be.revertedWith("V_ABNC");
    });
    it("Should fail to reinitialize", async () => {
      await expect(
        vault.initialize(
          positioningConfig.address,
          accountBalance.address,
          USDC.address,
          vaultController.address,
        ),
      ).to.be.revertedWith("Initializable: contract is already initialized");
    });
  });
  describe("Deposit", function () {
    it("Positive Test for deposit function", async () => {
      const amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap(amount);

      const USDCVaultAddress = await vaultController.getVault(USDC.address);

      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(USDCVaultAddress, amount);
      await USDC.connect(alice).approve(PerpPeriphery.address, amount);

      // check event has been sent
      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, alice.address, amount);

      // // reduce alice balance
      expect(await USDC.balanceOf(alice.address)).to.eq(
        parseUnits("99999999999999999900", await USDC.decimals()),
      );

      // // increase vault balance
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(
        parseUnits("100", await USDC.decimals()),
      );

      // // update sender's balance
      expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
        "100000000000000000000",
      );
    });

    it("Negative Test For desposit from vault after setting token balance cap ", async () => {
      await positioningConfig.setSettlementTokenBalanceCap("5000000000000000000");
      const USDCVaultAddress = await vaultController.getVault(USDC.address);

      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(USDCVaultAddress, "200000000000000000000");
      await USDC.connect(alice).approve(PerpPeriphery.address, "200000000000000000000");
      await expect(
        vaultController
          .connect(alice)
          .deposit(
            PerpPeriphery.address,
            USDC.address,
            alice.address,
            "200000000000000000000",
          ),
      ).to.be.revertedWith("V_GTSTBC");
    });
    it("Negative Test For desposit from vault after setting token balance cap for multiple users", async () => {
      const amount = parseUnits("2000000000000000000", await USDC.decimals());
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(USDCVaultAddress, amount);
      await USDC.connect(alice).approve(PerpPeriphery.address, amount);
      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);

      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, alice.address, amount);

      // // increase vault balance
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount);

      await expect(
        vaultController
          .connect(bob)
          .deposit(PerpPeriphery.address, USDC.address, bob.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, bob.address, amount);
      // // increase vault balance
      const amount2 = parseUnits("4000000000000000000", await USDC.decimals());
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount2);
      await expect(
        vaultController
          .connect(cole)
          .deposit(PerpPeriphery.address, USDC.address, cole.address, amount),
      ).to.be.revertedWith("V_GTSTBC");
    });
    it("Negative Test For desposit from vault after setting token balance cap for multiple users also with funds withdrawn", async () => {
      const amount = parseUnits("2000000000000000000", await USDC.decimals());
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);

      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);

      await expect(
        vaultController.deposit(PerpPeriphery.address, USDC.address, owner.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, owner.address, amount);

      // // increase vault balance
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount);

      await expect(
        vaultController
          .connect(bob)
          .deposit(PerpPeriphery.address, USDC.address, bob.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, bob.address, amount);
      // // increase vault balance
      const amount2 = parseUnits("4000000000000000000", await USDC.decimals());
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount2);
      // Withdraw by alice
      await accountBalance.grantSettleRealizedPnlRole(vaultController.address);
      await expect(
        vaultController.withdraw(
          USDC.address,
          owner.address,
          parseUnits("1000000000000000000", await USDC.decimals()),
        ),
      ).to.emit(USDCVaultContract, "Withdrawn");

      await expect(
        vaultController
          .connect(cole)
          .deposit(PerpPeriphery.address, USDC.address, cole.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, cole.address, amount);

      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);
      await expect(
        vaultController.deposit(
          PerpPeriphery.address,
          USDC.address,
          owner.address,
          parseUnits("1000000000000000000", await USDC.decimals()),
        ),
      ).to.be.revertedWith("V_GTSTBC");
    });
  });
  describe("Withdraw", function () {
    it("shoud not allow with draw when contract is paused", async () => {
      const amount = parseUnits("2000000000000000000", await USDC.decimals());
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);

      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);

      await expect(
        vaultController.deposit(PerpPeriphery.address, USDC.address, owner.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, owner.address, amount);

      // // increase vault balance
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount);

      await expect(
        vaultController
          .connect(bob)
          .deposit(PerpPeriphery.address, USDC.address, bob.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, bob.address, amount);
      // // increase vault balance
      const amount2 = parseUnits("4000000000000000000", await USDC.decimals());
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(amount2);
      // Withdraw by alice
      await vault.pause();
      await accountBalance.grantSettleRealizedPnlRole(vaultController.address);
      await expect(
        vaultController.withdraw(
          USDC.address,
          owner.address,
          parseUnits("1000000000000000000", await USDC.decimals()),
        ),
      ).to.be.revertedWith("Pausable: paused");
    });
    it("shoud not allow whitdraw when reentered", async () => {
      PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
      [owner, alice, relayer, bob, cole] = await ethers.getSigners();
      PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
      MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
      perpViewFake = await smock.fake("PerpView");

      const tokenFactory = await ethers.getContractFactory("TestERC20");
      const USDC1 = await tokenFactory.deploy();
      USDC = await USDC1.deployed();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

      const tokenFactory2 = await ethers.getContractFactory("TestERC20");
      const Dai = await tokenFactory2.deploy();
      DAI = await Dai.deployed();
      await DAI.__TestERC20_init("TestDai", "DAI", 18);

      const tokenFactory3 = await ethers.getContractFactory("TestERC20");
      const eth = await tokenFactory3.deploy();
      ETH = await eth.deployed();
      await eth.__TestERC20_init("TestETH", "ETH", 18);
      perpetualOracle = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [alice.address, alice.address, alice.address, alice.address],
          [10000000, 10000000, 10000000, 10000000],
          [10000000, 10000000],
          [proofHash, proofHash],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [alice.address, alice.address],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );
      const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
      positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
        perpetualOracle.address,
      ]);
      const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
      matchingEngine = await upgrades.deployProxy(
        MatchingEngine,
        [owner.address, perpetualOracle.address],
        {
          initializer: "__MatchingEngineTest_init",
        },
      );
      accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
        positioningConfig.address,
        [alice.address, alice.address, alice.address, alice.address],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        matchingEngine.address,
        owner.address,
      ]);

      const vaultContractFactory = await ethers.getContractFactory("VaultController");
      vaultController = await upgrades.deployProxy(vaultContractFactory, [
        positioningConfig.address,
        accountBalance.address,
      ]);

      vaultFactory = await ethers.getContractFactory("Vault");
      vault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        USDC.address,
        vaultController.address,
      ]);
      DAIVault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        DAI.address,
        vaultController.address,
      ]);

      Positioning = await ethers.getContractFactory("PositioningTest");
      positioning = await upgrades.deployProxy(
        Positioning,
        [
          positioningConfig.address,
          vaultController.address,
          accountBalance.address,
          matchingEngine.address,
          perpetualOracle.address,
          fundingRate.address,
          perpetualOracle.address,
          [alice.address, alice.address, alice.address, alice.address],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [owner.address, alice.address],
          ["1000000000000000000", "1000000000000000000"],
        ],
        {
          initializer: "initialize",
        },
      );
      await vaultController.connect(owner).setPositioning(positioning.address);
      await vaultController.registerVault(vault.address, USDC.address);
      await vaultController.registerVault(DAIVault.address, DAI.address);

      const amount = parseUnits("100000000000000000000", await USDC.decimals());
      await USDC.mint(alice.address, amount);
      await USDC.mint(bob.address, amount);
      await USDC.mint(cole.address, amount);
      await USDC.connect(alice).approve(vault.address, amount);
      await USDC.connect(bob).approve(vault.address, amount);
      await USDC.connect(cole).approve(vault.address, amount);
      await USDC.mint(owner.address, amount);

      const daiAmount = parseUnits("1000", await DAI.decimals());
      await DAI.mint(alice.address, daiAmount);
      await DAI.connect(alice).approve(DAIVault.address, daiAmount);

      await DAI.mint(owner.address, daiAmount);

      PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
        perpViewFake.address,
        perpetualOracle.address,
        [vault.address, vault.address],
        owner.address,
        relayer.address,
      ]);
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000000000000000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);

      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);

      await expect(
        vaultController
          .connect(bob)
          .deposit(PerpPeriphery.address, USDC.address, bob.address, amount),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, bob.address, amount);
      // // increase vault balance
      const devilERC20 = await ethers.getContractFactory("DevilTestERC20");
      const devil = await devilERC20.deploy();
      await devil.deployed();
      await devil.__TestERC20_init("TestUSDC", "USDC", 6);
      await vault.setSettlementToken(devil.address);
      const amount2 = parseUnits("4000000000000000000", await devil.decimals());
      const VaultController1 = await ethers.getContractFactory("VaultControllerTest");

      const vaultController1 = await VaultController1.deploy();
      await vaultController1.deployed();
      await vault.setVaultController(vaultController1.address);
      await expect(
        vaultController1.withdraw("1000000000000", owner.address, vault.address),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call'");
    });

    it("shoud not allow  deposit when reentered", async () => {
      PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
      [owner, alice, relayer, bob, cole] = await ethers.getSigners();
      PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");

      MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
      perpViewFake = await smock.fake("PerpView");

      const tokenFactory = await ethers.getContractFactory("TestERC20");
      const USDC1 = await tokenFactory.deploy();
      USDC = await USDC1.deployed();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

      const tokenFactory2 = await ethers.getContractFactory("TestERC20");
      const Dai = await tokenFactory2.deploy();
      DAI = await Dai.deployed();
      await DAI.__TestERC20_init("TestDai", "DAI", 18);

      const tokenFactory3 = await ethers.getContractFactory("TestERC20");
      const eth = await tokenFactory3.deploy();
      ETH = await eth.deployed();
      await eth.__TestERC20_init("TestETH", "ETH", 18);
      perpetualOracle = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [alice.address, alice.address, alice.address, alice.address],
          [10000000, 10000000, 10000000, 10000000],
          [10000000, 10000000],
          [proofHash, proofHash],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [alice.address, alice.address],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );
      const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
      positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
        perpetualOracle.address,
      ]);
      const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
      matchingEngine = await upgrades.deployProxy(
        MatchingEngine,
        [owner.address, perpetualOracle.address],
        {
          initializer: "__MatchingEngineTest_init",
        },
      );
      accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
        positioningConfig.address,
        [alice.address, alice.address, alice.address, alice.address],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        matchingEngine.address,
        owner.address,
      ]);

      const vaultContractFactory = await ethers.getContractFactory("VaultController");
      vaultController = await upgrades.deployProxy(vaultContractFactory, [
        positioningConfig.address,
        accountBalance.address,
      ]);

      vaultFactory = await ethers.getContractFactory("Vault");
      vault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        USDC.address,
        vaultController.address,
      ]);
      DAIVault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        DAI.address,
        vaultController.address,
      ]);

      Positioning = await ethers.getContractFactory("PositioningTest");
      positioning = await upgrades.deployProxy(
        Positioning,
        [
          positioningConfig.address,
          vaultController.address,
          accountBalance.address,
          matchingEngine.address,
          perpetualOracle.address,
          fundingRate.address,
          perpetualOracle.address,
          [alice.address, alice.address, alice.address, alice.address],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [owner.address, alice.address],
          ["1000000000000000000", "1000000000000000000"],
        ],
        {
          initializer: "initialize",
        },
      );
      await vaultController.connect(owner).setPositioning(positioning.address);
      await vaultController.registerVault(vault.address, USDC.address);
      await vaultController.registerVault(DAIVault.address, DAI.address);

      const amount = parseUnits("100000000000000000000", await USDC.decimals());
      await USDC.mint(alice.address, amount);
      await USDC.mint(bob.address, amount);
      await USDC.mint(cole.address, amount);
      await USDC.connect(alice).approve(vault.address, amount);
      await USDC.connect(bob).approve(vault.address, amount);
      await USDC.connect(cole).approve(vault.address, amount);
      await USDC.mint(owner.address, amount);

      const daiAmount = parseUnits("1000", await DAI.decimals());
      await DAI.mint(alice.address, daiAmount);
      await DAI.connect(alice).approve(DAIVault.address, daiAmount);

      await DAI.mint(owner.address, daiAmount);

      PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
        perpViewFake.address,
        perpetualOracle.address,
        [vault.address, vault.address],
        owner.address,
        relayer.address,
      ]);
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000000000000000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);

      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);
      const devilERC20 = await ethers.getContractFactory("DevilTestERC20");
      const devil = await devilERC20.deploy();
      await devil.deployed();
      await devil.__TestERC20_init("TestUSDC", "USDC", 6);
      await vault.setSettlementToken(devil.address);
      const amount2 = parseUnits("4000000000000000000", await devil.decimals());
      const VaultController1 = await ethers.getContractFactory("VaultControllerTest");

      const vaultController1 = await VaultController1.deploy();
      await vaultController1.deployed();
      await vault.setVaultController(vaultController1.address);
      await expect(
        vaultController1
          .connect(bob)
          .deposit(PerpPeriphery.address, bob.address, amount, vault.address),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("should not allow user to withdraw from vault if vault balance is empty", async () => {
      const amount = parseUnits("100", await USDC.decimals());
      await positioningConfig.setSettlementTokenBalanceCap(amount);
      await accountBalance.grantSettleRealizedPnlRole(vaultController.address);

      await expect(
        vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
      ).to.be.revertedWith("V_NEFC");
    });

    it("should allow user to deposit max collateral", async () => {
      const userBalance = await USDC.balanceOf(alice.address);

      await positioningConfig.setSettlementTokenBalanceCap(userBalance);

      const USDCVaultAddress = await vaultController.getVault(USDC.address);

      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(USDCVaultAddress, userBalance);
      await USDC.connect(alice).approve(PerpPeriphery.address, userBalance);

      // Deposit max amount equal to balance of the user
      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, userBalance),
      )
        .to.emit(USDCVaultContract, "Deposited")
        .withArgs(USDC.address, alice.address, userBalance);

      // User balance should be 0 as alice deposited whole collateral
      expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("0", await USDC.decimals()));

      // Vault balance should increase
      expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(userBalance.toString());

      // update sender's balance
      expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
        "100000000000000000000000000000000000000",
      );
    });

    it("should not allow user to interact directly with Vault - deposit", async () => {
      const userBalance = await USDC.balanceOf(alice.address);
      // Deposit max amount equal to balance of the user
      await expect(
        vault.deposit(PerpPeriphery.address, userBalance, alice.address),
      ).to.be.revertedWith("V_OVC");
    });

    it("should not allow user to interact directly with Vault - withdraw", async () => {
      const userBalance = await USDC.balanceOf(alice.address);

      await expect(vault.withdraw(userBalance, alice.address)).to.be.revertedWith("V_OVC");
    });

    it("should not allow user to deposit amount greater than max collateral", async () => {
      const userBalance = await USDC.balanceOf(alice.address);
      const userBalance2x = userBalance.add(userBalance);

      await positioningConfig.setSettlementTokenBalanceCap(userBalance);

      const USDCVaultAddress = await vaultController.getVault(USDC.address);

      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(USDCVaultAddress, userBalance2x);
      await USDC.connect(alice).approve(PerpPeriphery.address, userBalance2x);

      // Deposit max amount equal to balance of the user
      await expect(
        vaultController.connect(alice).deposit(
          PerpPeriphery.address,
          USDC.address,
          alice.address,
          userBalance2x, // 2x - user balance
        ),
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");
    });

    it("should not allow user to interact with vault if contract is paused", async () => {
      await vault.pause();

      const userBalance = await USDC.balanceOf(alice.address);
      // Deposit max amount equal to balance of the user
      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, userBalance),
      ).to.be.revertedWith("Pausable: paused");
    });

    it("force error, amount more than allowance", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());

      await positioningConfig.setSettlementTokenBalanceCap(amount);

      await expect(
        vaultController
          .connect(owner)
          .deposit(PerpPeriphery.address, USDC.address, owner.address, amount),
      ).to.be.revertedWith("ERC20: insufficient allowance");
    });

    it("force error, greater than settlement token balance cap", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());

      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.connect(alice).approve(PerpPeriphery.address, amount);

      await USDC.connect(alice).approve(USDCVaultAddress, amount);
      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
      ).to.be.revertedWith("V_GTSTBC");
    });

    it("force error, inconsistent vault balance with deflationary token", async () => {
      const [owner, alice] = await ethers.getSigners();
      const amount = parseUnits("100", await USDC.decimals());

      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);

      await USDC.connect(alice).approve(USDCVaultAddress, amount);
      await USDC.connect(alice).approve(PerpPeriphery.address, amount);

      USDC.setTransferFeeRatio(50);
      await expect(
        vaultController
          .connect(alice)
          .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
      ).to.be.revertedWith("V_IBA");
      USDC.setTransferFeeRatio(0);
    });
  });
  describe("Test for transfer funds to vault", function () {
    it("Positive Test for transferFundToVault", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);
      const userBalance = await USDC.balanceOf(owner.address);
      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // reduce owner balance
      expect(await USDC.balanceOf(owner.address)).to.eq("10099999999999999999900000000");

      // increase vault balance
      expect(await USDC.balanceOf(vault.address)).to.eq(parseUnits("100", await USDC.decimals()));

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()));
    });
    it("Negative Test for transferFundToVault", async () => {
      PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
      const [owner, alice, relayer, bob, cole] = await ethers.getSigners();
      PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");

      MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
      perpViewFake = await smock.fake("PerpView");

      const tokenFactory = await ethers.getContractFactory("TestERC20");
      const USDC1 = await tokenFactory.deploy();
      USDC = await USDC1.deployed();
      await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

      const tokenFactory2 = await ethers.getContractFactory("TestERC20");
      const Dai = await tokenFactory2.deploy();
      DAI = await Dai.deployed();
      await DAI.__TestERC20_init("TestDai", "DAI", 18);

      const tokenFactory3 = await ethers.getContractFactory("TestERC20");
      const eth = await tokenFactory3.deploy();
      ETH = await eth.deployed();
      await eth.__TestERC20_init("TestETH", "ETH", 18);
      perpetualOracle = await upgrades.deployProxy(
        PerpetualOracle,
        [
          [alice.address, alice.address, alice.address, alice.address],
          [10000000, 10000000, 10000000, 10000000],
          [10000000, 10000000],
          [proofHash, proofHash],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [alice.address, alice.address],
          owner.address,
        ],
        { initializer: "__PerpetualOracle_init" },
      );
      const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
      positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
        perpViewFake.address,
      ]);
      matchingEngine = await upgrades.deployProxy(
        MatchingEngine,
        [owner.address, perpetualOracle.address],
        {
          initializer: "__MatchingEngineTest_init",
        },
      );
      const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
      accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
        positioningConfig.address,
        [alice.address, alice.address, alice.address, alice.address],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        matchingEngine.address,
        owner.address,
      ]);

      const vaultContractFactory = await ethers.getContractFactory("VaultController");
      vaultController = await upgrades.deployProxy(vaultContractFactory, [
        positioningConfig.address,
        accountBalance.address,
      ]);

      vaultFactory = await ethers.getContractFactory("Vault");
      vault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        USDC.address,
        vaultController.address,
      ]);
      DAIVault = await upgrades.deployProxy(vaultFactory, [
        positioningConfig.address,
        accountBalance.address,
        DAI.address,
        vaultController.address,
      ]);

      Positioning = await ethers.getContractFactory("PositioningTest");
      positioning = await upgrades.deployProxy(
        Positioning,
        [
          positioningConfig.address,
          vaultController.address,
          accountBalance.address,
          matchingEngine.address,
          perpetualOracle.address,
          fundingRate.address,
          perpetualOracle.address,
          [alice.address, alice.address, alice.address, alice.address],
          [chainlinkTokenIndex1, chainlinkTokenIndex2],
          [owner.address, alice.address],
          ["1000000000000000000", "1000000000000000000"],
        ],
        {
          initializer: "initialize",
        },
      );
      await vaultController.connect(owner).setPositioning(positioning.address);
      await vaultController.registerVault(vault.address, USDC.address);
      await vaultController.registerVault(DAIVault.address, DAI.address);

      const amount = parseUnits("100000000000000000000", await USDC.decimals());
      await USDC.mint(alice.address, amount);
      await USDC.mint(bob.address, amount);
      await USDC.mint(cole.address, amount);
      await USDC.connect(alice).approve(vault.address, amount);
      await USDC.connect(bob).approve(vault.address, amount);
      await USDC.connect(cole).approve(vault.address, amount);
      await USDC.mint(owner.address, amount);

      const daiAmount = parseUnits("1000", await DAI.decimals());
      await DAI.mint(alice.address, daiAmount);
      await DAI.connect(alice).approve(DAIVault.address, daiAmount);

      await DAI.mint(owner.address, daiAmount);

      PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
        perpViewFake.address,
        perpetualOracle.address,
        [vault.address, vault.address],
        owner.address,
        relayer.address,
      ]);
      await positioningConfig.setSettlementTokenBalanceCap(
        parseUnits("5000000000000000000000000000000000000000000000", await USDC.decimals()),
      );
      const USDCVaultAddress = await vaultController.getVault(USDC.address);
      const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
      await USDC.approve(USDCVaultAddress, amount);
      await USDC.approve(PerpPeriphery.address, amount);

      await USDC.connect(bob).approve(USDCVaultAddress, amount);
      await USDC.connect(bob).approve(PerpPeriphery.address, amount);
      await USDC.connect(cole).approve(USDCVaultAddress, amount);
      await USDC.connect(cole).approve(PerpPeriphery.address, amount);
      const devilERC20 = await ethers.getContractFactory("VaultTestERC20");
      const devil = await devilERC20.deploy();
      await devil.deployed();
      await devil.__TestERC20_init("TestUSDC", "USDC", 6);
      await vault.setSettlementToken(devil.address);
      const amount2 = parseUnits("4000000000000000000", await devil.decimals());

      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(
        vault.connect(owner).transferFundToVault(devil.address, amount),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });

    it("Force error, not called by owner", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // caller not owner
      await expect(
        vault.connect(alice).transferFundToVault(USDC.address, amount),
      ).to.be.revertedWith("Vault: Not admin");
    });

    it("Force error, not settlement token", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // caller not owner
      await expect(vault.transferFundToVault(ETH.address, amount)).to.be.revertedWith("V_OST");
    });
    it("Force error, when contract is paused", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);
      await vault.pause();
      // caller not owner
      await expect(vault.transferFundToVault(USDC.address, amount)).to.be.revertedWith(
        "Pausable: paused",
      );
    });

    it("Check for set position address", async () => {
      const [owner, alice] = await ethers.getSigners();

      await vault.connect(owner).setPositioning(positioningConfig.address);
      expect(await vault.connect(owner).getPositioning()).to.be.equal(positioningConfig.address);
    });
    it("Should not be able to set positiong", async () => {
      const [owner, alice] = await ethers.getSigners();
      await expect(
        vault.connect(alice).setPositioning(positioningConfig.address),
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should not be able to set positiong if positioning address in not contract", async () => {
      const [owner, alice] = await ethers.getSigners();
      await expect(vault.setPositioning(alice.address)).to.be.revertedWith("V_VPMM");
    });
    it("Should not be able to set Vault Controller", async () => {
      const [owner, alice] = await ethers.getSigners();
      await expect(
        vault.connect(alice).setVaultController(vaultController.address),
      ).to.be.revertedWith("Vault: Not admin");
    });
    it("Should not be able to set Vault Controller", async () => {
      const [owner, alice] = await ethers.getSigners();
      await expect(vault.setVaultController(alice.address)).to.be.revertedWith("V_VPMM");
    });

    it("Check for set vault controller", async () => {
      const [owner, alice] = await ethers.getSigners();

      const vaultControllerFactory = await ethers.getContractFactory("VaultController");
      const newVaultController = await upgrades.deployProxy(vaultControllerFactory, [
        positioningConfig.address,
        accountBalance.address,
      ]);
      await newVaultController.deployed();

      await vault.connect(owner).setVaultController(newVaultController.address);
      expect(await vault.connect(owner).getVaultController()).to.be.equal(
        newVaultController.address,
      );
    });
  });

  describe("Test for debt repayment", function () {
    it("Positive Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()));

      // Repay debt
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount))
        .to.emit(vault, "DebtRepayed")
        .withArgs(owner.address, amount);

      // Debt decreases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("0", await USDC.decimals()));
    });
    it("Negative Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // Debt increases on vault
      const devilERC20 = await ethers.getContractFactory("VaultTestERC20");
      const devil = await devilERC20.deploy();
      await devil.deployed();
      await devil.__TestERC20_init("TestUSDC", "USDC", 6);
      await vault.setSettlementToken(devil.address);
      // Repay debt
      await expect(
        vault.connect(owner).repayDebtToOwner(devil.address, amount),
      ).to.be.revertedWith("ReentrancyGuard: reentrant call");
    });
    it("Positive Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()));

      // Repay debt
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount))
        .to.emit(vault, "DebtRepayed")
        .withArgs(owner.address, amount);

      // Debt decreases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("0", await USDC.decimals()));
    });
    it("Negative Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()));

      // Repay debt
      await expect(
        vault.connect(owner).repayDebtToOwner(owner.address, amount),
      ).to.be.revertedWith("V_OST");
    });
    it("Negative Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount);

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()));

      //do not  Repay debt
      await vault.pause();
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith(
        "Pausable: paused",
      );
    });

    it("Force error, not called by owner", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // caller not owner
      await expect(vault.connect(alice).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith(
        "Vault: Not admin",
      );
    });

    it("Force error, amount is more that debt", async () => {
      const [owner, alice] = await ethers.getSigners();

      const amount = parseUnits("100", await USDC.decimals());
      await USDC.connect(owner).approve(vault.address, amount);

      // amount is more that debt
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith(
        "V_AIMTD",
      );
    });
  });

  describe("Test for getters", function () {
    it("Tests for getPositioningConfig", async function () {
      expect(await vault.getPositioningConfig()).to.be.equal(positioningConfig.address);
    });

    it("Tests for getSettlementToken", async function () {
      expect(await vault.getSettlementToken()).to.be.equal(USDC.address);
    });

    it("Tests for getAccountBalance", async function () {
      expect(await vault.getAccountBalance()).to.be.equal(accountBalance.address);
    });
  });

  describe("Test for setters", function () {
    it("Tests for setSettlementToken", async function () {
      const tokenFactory = await ethers.getContractFactory("TestERC20");
      const newUSDC = await tokenFactory.deploy();
      const NewUSDC = await newUSDC.deployed();
      await NewUSDC.__TestERC20_init("TestUSDC", "USDC", 6);

      await vault.setSettlementToken(NewUSDC.address);
      expect(await vault.getSettlementToken()).to.be.equal(NewUSDC.address);
    });
  });
});
