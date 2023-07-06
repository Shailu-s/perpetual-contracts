import { parseUnits } from "ethers/lib/utils";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { MatchingEngine } from "../typechain";
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
  let PerpetualOracle;
  let perpetualOracle;
  let ChainLinkAggregator;
  let chainlinkAggregator1;
  let chainlinkAggregator2;
  let VolmexBaseToken;
  let volmexBaseToken;
  let volmexBaseToken1;
  let volmexBaseToken2;
  let volmexBaseToken3;
  let FundingRate;
  let fundingRate;
  let Positioning;
  let positioning;
  let VolmexPerpPeriphery;
  let volmexPerpPeriphery;
  let perpViewFake;
  let owner, alice, relayer;
  const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
  const capRatio = "250";
  const twapType = "0x1444f8cf";
  const chainlinkTokenIndex1 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819969";
  const chainlinkTokenIndex2 =
    "57896044618658097711785492504343953926634992332820282019728792003956564819970";
  this.beforeEach(async function () {
    [owner, alice, relayer] = await ethers.getSigners();

    VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
    VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken");
    perpViewFake = await smock.fake("VolmexPerpView");
    FundingRate = await ethers.getContractFactory("FundingRate");
    ChainLinkAggregator = await ethers.getContractFactory("MockV3Aggregator");

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
    volmexBaseToken2 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken2.deployed();
    volmexBaseToken3 = await upgrades.deployProxy(
      VolmexBaseToken,
      [
        "VolmexBaseToken", // nameArg
        "VBT", // symbolArg,
        owner.address, // priceFeedArg
        true, // isBase
      ],
      {
        initializer: "initialize",
      },
    );
    await volmexBaseToken3.deployed();
    chainlinkAggregator1 = await ChainLinkAggregator.deploy(8, 3075000000000);
    await chainlinkAggregator1.deployed();
    chainlinkAggregator2 = await ChainLinkAggregator.deploy(8, 180000000000);
    await chainlinkAggregator2.deployed();
    perpetualOracle = await upgrades.deployProxy(
      PerpetualOracle,
      [
        [
          volmexBaseToken.address,
          volmexBaseToken.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
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

    await volmexBaseToken.setPriceFeed(perpetualOracle.address);

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
      perpetualOracle.address,
    ]);

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance");
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [
      positioningConfig.address,
      [
        volmexBaseToken.address,
        volmexBaseToken.address,
        volmexBaseToken2.address,
        volmexBaseToken3.address,
      ],
      [chainlinkTokenIndex1, chainlinkTokenIndex2],
      matchingEngineFake.address,
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
    await accountBalance.grantSettleRealizedPnlRole(vaultController.address);
    await accountBalance.grantSettleRealizedPnlRole(vault.address);

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
        matchingEngineFake.address,
        perpetualOracle.address,
        fundingRate.address,
        perpetualOracle.address,
        [
          volmexBaseToken.address,
          volmexBaseToken.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
        ],
        [chainlinkTokenIndex1, chainlinkTokenIndex2],
        [owner.address, alice.address],
        ["1000000000000000000", "1000000000000000000"],
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
      perpetualOracle.address,
      [vault.address, vault.address],
      owner.address,
      relayer.address,
    ]);
  });

  it("Negative Test for withdrawal of token", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await positioningConfig.setSettlementTokenBalanceCap(amount);

    const USDCVaultAddress = await vaultController.getVault(USDC.address);

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
    await USDC.connect(alice).approve(USDCVaultAddress, amount);
    await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount);

    const Positioning = await ethers.getContractFactory("PositioningMock");
    const positioning = await upgrades.deployProxy(
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
          volmexBaseToken.address,
          volmexBaseToken.address,
          volmexBaseToken2.address,
          volmexBaseToken3.address,
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

    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.be.revertedWith("ReentrancyGuard: reentrant call");
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

  it("should not return  account value when contract is paused", async () => {
    await vaultController.pause();
    await expect(vaultController.getAccountValue(owner.address)).to.be.revertedWith(
      "Pausable: paused",
    );
  });
  it("Negative Test for withdrawal of token", async () => {
    const amount = parseUnits("100", await USDC.decimals());

    await expect(
      vaultController.connect(alice).withdraw(USDC.address, alice.address, amount),
    ).to.be.revertedWith("V_NEFC");
  });
});
