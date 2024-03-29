import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";

describe("Vault Controller deposit tests", function () {
  let USDC;
  let positioningConfig;
  let accountBalance;
  let vault;
  let DAIVault;
  let vaultController;
  let vaultFactory;
  let DAI;
  let PerpetualOracle;
  let perpetualOracle;
  let matchingEngineFake;
  let Positioning;
  let positioning;
  let PerpPeriphery;
  let PerpPeriphery;
  let BaseToken;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let BaseToken;
  let BaseToken1;
  let FundingRate;
  let fundingRate;
  let BaseToken2;
  let BaseToken3;
  let prepViewFake;
  let owner, alice, relayer;
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
    [owner, alice, relayer] = await ethers.getSigners();
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    FundingRate = await ethers.getContractFactory("FundingRate");
    BaseToken = await ethers.getContractFactory("BaseToken");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");

    matchingEngineFake = await smock.fake("MatchingEngine");
    prepViewFake = await smock.fake("PerpView");

    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const USDC1 = await tokenFactory.deploy();
    USDC = await USDC1.deployed();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();
    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 10);
    BaseToken = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        alice.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
    BaseToken1 = await upgrades.deployProxy(
      BaseToken,
      [
        "BaseToken", // nameArg
        "VBT", // symbolArg,
        alice.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await BaseToken.deployed();
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
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          BaseToken.address,
          BaseToken1.address,
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
    const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
    positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
      perpetualOracle.address,
    ]);

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
      [
        BaseToken.address,
        BaseToken1.address,
        BaseToken2.address,
        BaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      alice.address,
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
    fundingRate = await upgrades.deployProxy(
      FundingRate,
      [perpetualOracle.address, positioningConfig.address, accountBalance.address, owner.address],
      {
        initializer: "FundingRate_init",
      },
    );

    Positioning = await ethers.getContractFactory("PositioningTest");
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        matchingEngineFake.address,
        perpetualOracle.address,
        fundingRate.address,
        perpetualOracle.address,
        [
          BaseToken.address,
          BaseToken1.address,
          BaseToken2.address,
          BaseToken3.address,
        ],
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

    const amount = parseUnits("1000", await USDC.decimals());
    await USDC.mint(alice.address, amount);

    await USDC.connect(alice).approve(vaultController.address, amount);

    const DAIAmount = parseUnits("1000", await DAI.decimals());
    await DAI.mint(alice.address, DAIAmount);

    await DAI.connect(alice).approve(vaultController.address, DAIAmount);
    await USDC.mint(owner.address, DAIAmount);

    PerpPeriphery = await upgrades.deployProxy(PerpPeriphery, [
      prepViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
    await vaultController.setPeriphery(PerpPeriphery.address);
  });
  it("shoud fail to initialize again", async () => {
    await expect(
      vaultController.initialize(positioningConfig.address, accountBalance.address),
    ).to.be.revertedWith("Initializable: contract is already initialized");
  });
  it("shoud fail to register vault", async () => {
    const [owner, alice] = await ethers.getSigners();
    await expect(
      vaultController.connect(alice).registerVault(vault.address, USDC.address),
    ).to.be.revertedWith("VaultController: Not admin");
  });
  it("shoud fail to setPositioning", async () => {
    await expect(vaultController.setPositioning(ZERO_ADDR)).to.be.revertedWith("V_VPMM");
  });
  it("shoud fail to pause", async () => {
    const [owner, alice] = await ethers.getSigners();
    await expect(vaultController.connect(alice).pause()).to.be.revertedWith(
      "Ownable: caller is not the owner",
    );
  });
  it("Negative  Test for deposit function when paused", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(PerpPeriphery.address, amount);
    await vaultController.pause();
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("Pausable: paused");
  });
  it("Positive  Test for deposit function when paused and unpaused", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(PerpPeriphery.address, amount);
    await vaultController.pause();
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("Pausable: paused");
    await vaultController.unpause();
    await expect(
      vaultController
        .connect(alice)
        .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
    )
      .to.emit(USDCVaultContract, "Deposited")
      .withArgs(USDC.address, alice.address, amount);
  });
  it("Negative  Test for non re entrant ", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);
    const Vault1 = await ethers.getContractFactory("VaultMock");
    const vault1 = await upgrades.deployProxy(Vault1, []);
    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();

    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 10);
    await vaultController.registerVault(vault1.address, Dai.address);
    await USDC.connect(alice).approve(vault1.address, amount);
    await USDC.connect(alice).approve(PerpPeriphery.address, amount);

    await expect(
      vaultController
        .connect(alice)
        .deposit(PerpPeriphery.address, Dai.address, alice.address, amount),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call");
  });
  it("Negative  Test for deposit when vault is not registered", async () => {
    const [owner, alice] = await ethers.getSigners();

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
        .deposit(PerpPeriphery.address, alice.address, alice.address, amount),
    ).to.be.revertedWith("VC_VOTNA");
  });
  it("Negative  Test for deposit when amount is 0", async () => {
    const [owner, alice] = await ethers.getSigners();

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
        .deposit(PerpPeriphery.address, USDC.address, alice.address, "0"),
    ).to.be.revertedWith("VC_CDZA");
  });

  it("Positive Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners();

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
    expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()));

    // // increase vault balance
    expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(parseUnits("100", await USDC.decimals()));

    // // update sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );
  });
  it("Positive Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners();

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
    expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()));

    // // increase vault balance
    expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(parseUnits("100", await USDC.decimals()));
    await vaultController.registerVault(ZERO_ADDR, ZERO_ADDR);
    // // update sender's balance
    expect(await vaultController.getBalance(alice.address)).to.eq("100000000000000000000");
  });

  it("Negative Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());
    await positioningConfig.setSettlementTokenBalanceCap(amount);

    // test fail for no vault from this token
    await expect(
      vaultController
        .connect(alice)
        .deposit(PerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Test for deployment of vault via factory", async () => {
    const [owner, alice] = await ethers.getSigners();

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    expect(USDCVaultAddress).to.not.equal("");
  });
});
