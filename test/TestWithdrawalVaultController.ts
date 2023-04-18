import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MarkPriceOracle, IndexPriceOracle, MatchingEngine } from "../typechain";
import { FakeContract, smock } from "@defi-wonderland/smock";

describe("Vault Controller tests for withdrawal", function () {
  let USDC;
  let positioningConfig;
  let accountBalance;
  let vault;
  let DAIVault;
  let vaultController;
  let vaultFactory;
  let DAI;
  let matchingEngineFake: FakeContract<MatchingEngine>;
  let MarkPriceOracle;
  let markPriceOracle;
  let IndexPriceOracle;
  let indexPriceOracle;
  let VolmexBaseToken;
  let volmexBaseToken;
  let Positioning;
  let positioning;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let perpViewFake;
  let owner, alice, relayer;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  const twapType = "0x1444f8cf";

  this.beforeEach(async function () {
    [owner, alice, relayer] = await ethers.getSigners();

    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle");
    IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    perpViewFake = await smock.fake("VolmexPerpView");

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
    indexPriceOracle = await upgrades.deployProxy(
      IndexPriceOracle,
      [owner.address, [100000], [volmexBaseToken.address], [proofHash], [capRatio]],
      {
        initializer: "initialize",
      },
    );
    await indexPriceOracle.deployed();
    await volmexBaseToken.setPriceFeed(indexPriceOracle.address);
    markPriceOracle = await upgrades.deployProxy(
      MarkPriceOracle,
      [[100000], [volmexBaseToken.address], owner.address],
      {
        initializer: "initialize",
      },
    );
    await markPriceOracle.deployed();

    matchingEngineFake = await smock.fake("MatchingEngine");

    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const USDC1 = await tokenFactory.deploy();
    USDC = await USDC1.deployed();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();
    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 10);

    const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig");
    positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [
      markPriceOracle.address,
    ]);

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
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
    await accountBalance.grantSettleRealizedPnlRole(vaultController.address);
    await accountBalance.grantSettleRealizedPnlRole(vault.address);

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
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
        [owner.address, alice.address],
      ],
      {
        initializer: "initialize",
      },
    );

    await accountBalance.setPositioning(positioning.address);
    await vaultController.connect(owner).setPositioning(positioning.address);
    await vaultController.registerVault(vault.address, USDC.address);
    await vaultController.registerVault(DAIVault.address, DAI.address);

    const amount = parseUnits("1000", await USDC.decimals());
    await USDC.mint(alice.address, amount);

    await USDC.connect(alice).approve(vaultController.address, amount);

    const DAIAmount = parseUnits("1000", await DAI.decimals());
    await DAI.mint(alice.address, DAIAmount);

    await DAI.connect(alice).approve(vaultController.address, DAIAmount);

    volmexPerpPeriphery = await upgrades.deployProxy(VolmexPerpPeriphery, [
      perpViewFake.address,
      markPriceOracle.address,
      indexPriceOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
  });

  it("Positive Test for withdrawal of token", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await USDCVaultContract.setPositioning(positioning.address);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Deposited");

    // // check sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );

    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Withdrawn");
  });
  it("Positive Test for withdrawal of token when vault has low balance", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await USDCVaultContract.setPositioning(positioning.address);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Deposited");

    // // check sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );

    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Withdrawn");
  });
  it("Negative Test for withdrawal of token", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await USDCVaultContract.setPositioning(positioning.address);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Deposited");

    // // check sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );
    await vaultController.pause();
    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.be.revertedWith("Pausable: paused");
  });
  it("Negative Test for withdrawal of token when vault addressis zero", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await USDCVaultContract.setPositioning(positioning.address);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Deposited");

    // // check sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );
    await expect(
      vaultController.connect(alice).withdraw(alice.address, alice.address, amount),
    ).to.be.revertedWith("VC_VOTNA");
  });
  it("Negative Test for withdrawal of token when amount zero", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await USDCVaultContract.setPositioning(positioning.address);

    // check event has been sent
    await expect(
      vaultController
        .connect(alice)
        .deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount),
    ).to.emit(USDCVaultContract, "Deposited");

    // // check sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );
    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, "0"),
    ).to.be.revertedWith("VC_CWZA");
  });
  it("when positioning is not set", async () => {
    const vaultContractFactory = await ethers.getContractFactory("VaultController");
    const [owner, alice] = await ethers.getSigners();
    let vaultController1 = await upgrades.deployProxy(vaultContractFactory, [
      positioningConfig.address,
      accountBalance.address,
    ]);

    vaultFactory = await ethers.getContractFactory("Vault");
    vault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      USDC.address,
      vaultController1.address,
    ]);
    DAIVault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      DAI.address,
      vaultController1.address,
    ]);

    Positioning = await ethers.getContractFactory("PositioningTest");
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController1.address,
        accountBalance.address,
        matchingEngineFake.address,
        markPriceOracle.address,
        indexPriceOracle.address,
        0,
        [owner.address, alice.address],
      ],
      {
        initializer: "initialize",
      },
    );

    await vaultController1.registerVault(vault.address, USDC.address);
    await vaultController1.registerVault(DAIVault.address, DAI.address);

    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController1.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);
    await expect(
      vaultController1.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.be.revertedWith("VC_PNS");
  });
  it("Negative Test for withdrawal of token", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.be.revertedWith("V_NEFC");
  });
});
