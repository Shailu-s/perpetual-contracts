import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { sample } from "lodash";

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
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let VolmexBaseToken;
  let volmexBaseToken;
  let prepViewFake;
  let owner, alice, relayer;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

  beforeEach(async function () {
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    [owner, alice, relayer] = await ethers.getSigners();
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    matchingEngineFake = await smock.fake("MatchingEngine");
    prepViewFake = await smock.fake("VolmexPerpView");

    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const USDC1 = await tokenFactory.deploy();
    USDC = await USDC1.deployed();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();
    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 10);
    volmexBaseToken = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        alice.address, // priceFeedArg
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
    const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
    positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
      perpetualOracle.address,
    ]);

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
      [volmexBaseToken.address, volmexBaseToken.address],
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
        matchingEngineFake.address,
        perpetualOracle.address,
        perpetualOracle.address,
        [volmexBaseToken.address, volmexBaseToken.address],
        [owner.address, alice.address],
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

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      prepViewFake.address,
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
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
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await vaultController.pause();
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("Pausable: paused");
  });
  it("Positive  Test for deposit function when paused and unpaused", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await vaultController.pause();
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("Pausable: paused");
    await vaultController.unpause();
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
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
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);

    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, Dai.address, alice.address, amount),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call");
  });
  it("Negative  Test for deposit when vault is not registered", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, alice.address, alice.address, amount),
    ).to.be.revertedWith("VC_VOTNA");
  });
  it("Negative  Test for deposit when amount is 0", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, "0"),
    ).to.be.revertedWith("VC_CDZA");
  });

  it("Positive Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners();

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
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
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
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
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.be.revertedWith("ERC20: insufficient allowance");
  });

  it("Test for deployment of vault via factory", async () => {
    const [owner, alice] = await ethers.getSigners();

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    expect(USDCVaultAddress).to.not.equal("");
  });
});
