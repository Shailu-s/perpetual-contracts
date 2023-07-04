import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { FakeContract, smock } from "@defi-wonderland/smock";
import { MarketRegistry } from "../typechain";

describe("Vault Controller Mock tests for account value", function () {
  let USDC;
  let positioningConfig;
  let accountBalance;
  let vault;
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
  let FundingRate;
  let fundingRate;
  let prepViewFake;
  let owner, alice, relayer;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  beforeEach(async function () {
    [owner, alice, relayer] = await ethers.getSigners();
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    FundingRate = await ethers.getContractFactory("FundingRate");
    matchingEngineFake = await smock.fake("MatchingEngine");
    prepViewFake = await smock.fake("VolmexPerpView");

    const tokenFactory = await ethers.getContractFactory("TestERC20");
    const USDC1 = await tokenFactory.deploy();
    USDC = await USDC1.deployed();
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6);

    const tokenFactory2 = await ethers.getContractFactory("TestERC20");
    const Dai = await tokenFactory2.deploy();
    DAI = await Dai.deployed();
    await DAI.__TestERC20_init("TestDai", "DAI", 18);
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
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
      [alice.address, alice.address, alice.address, alice.address],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      alice.address,
      owner.address,
    ]);

    const vaultControllerFactory = await ethers.getContractFactory("VaultController");
    vaultController = await upgrades.deployProxy(vaultControllerFactory, [
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
    await vault.deployed();
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

  it("Positive Test for single token getAccountValue", async () => {
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

    // update sender's balance
    expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq(
      "100000000000000000000",
    );
    expect(
      (
        await vaultController.connect(positioning.address).getAccountValue(alice.address)
      ).toString(),
    ).to.be.equal("100000000000000000000");
  });
});
