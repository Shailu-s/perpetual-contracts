import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { IndexPriceOracle, MarkPriceOracle } from "../typechain"
import { FakeContract, smock } from "@defi-wonderland/smock"

describe("Vault tests", function () {
  let USDC
  let positioningConfig
  let accountBalance
  let vault
  let DAIVault
  let vaultController
  let vaultFactory
  let DAI
  let markPriceFake: FakeContract<MarkPriceOracle>
  let indexPriceFake: FakeContract<IndexPriceOracle>
  let matchingEngineFake: FakeContract<MarkPriceOracle>
  let Positioning
  let positioning

  beforeEach(async function () {
    const [owner, alice] = await ethers.getSigners()
    markPriceFake = await smock.fake("MarkPriceOracle")
    indexPriceFake = await smock.fake("IndexPriceOracle")
    matchingEngineFake = await smock.fake('MatchingEngine')

    const tokenFactory = await ethers.getContractFactory("TestERC20")
    const USDC1 = await tokenFactory.deploy()
    USDC = await USDC1.deployed()
    await USDC.__TestERC20_init("TestUSDC", "USDC", 6)

    const tokenFactory2 = await ethers.getContractFactory("TestERC20")
    const Dai = await tokenFactory2.deploy()
    DAI = await Dai.deployed()
    await DAI.__TestERC20_init("TestDai", "DAI", 10)

    const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig")
    positioningConfig = await upgrades.deployProxy(positioningConfigFactory, [])

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
    accountBalance = await upgrades.deployProxy(accountBalanceFactory, [positioningConfig.address])

    const vaultContractFactory = await ethers.getContractFactory("VaultController")
    vaultController = await upgrades.deployProxy(vaultContractFactory, [
      positioningConfig.address,
      accountBalance.address,
    ])

    vaultFactory = await ethers.getContractFactory("Vault")
    vault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      USDC.address,
      vaultController.address,
      false,
    ])
    DAIVault = await upgrades.deployProxy(vaultFactory, [
      positioningConfig.address,
      accountBalance.address,
      DAI.address,
      vaultController.address,
      false,
    ])

    Positioning = await ethers.getContractFactory("PositioningTest")
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        matchingEngineFake.address,
        markPriceFake.address,
        indexPriceFake.address,
        0
      ],
      {
        initializer: "initialize",
      },
    )

    await vaultController.connect(owner).setPositioning(positioning.address)
    await vaultController.registerVault(vault.address, USDC.address)
    await vaultController.registerVault(DAIVault.address, DAI.address)

    const amount = parseUnits("1000", await USDC.decimals())
    await USDC.mint(alice.address, amount)
    await USDC.connect(alice).approve(vault.address, amount)

    await USDC.mint(owner.address, amount)
  })
  // @SAMPLE - deposit
  it("Positive Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners()

    const amount = parseUnits("100", await USDC.decimals())

    await positioningConfig.setSettlementTokenBalanceCap(amount)

    const USDCVaultAddress = await vaultController.getVault(USDC.address)

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)
    await USDC.connect(alice).approve(USDCVaultAddress, amount)

    // check event has been sent
    await expect(vaultController.connect(alice).deposit(USDC.address, amount))
      .to.emit(USDCVaultContract, "Deposited")
      .withArgs(USDC.address, alice.address, amount)

    // // reduce alice balance
    expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()))

    // // increase vault balance
    expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(parseUnits("100", await USDC.decimals()))

    // // update sender's balance
    expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))
  })

  it("force error,amount more than allowance", async () => {
    const [owner, alice] = await ethers.getSigners()

    const amount = parseUnits("100", await USDC.decimals())

    await positioningConfig.setSettlementTokenBalanceCap(amount)

    await expect(vaultController.connect(owner).deposit(USDC.address, amount)).to.be.revertedWith(
      "ERC20: insufficient allowance",
    )
  })

  it("force error, greater than settlement token balance cap", async () => {
    const [owner, alice] = await ethers.getSigners()

    const amount = parseUnits("100", await USDC.decimals())

    const USDCVaultAddress = await vaultController.getVault(USDC.address)
    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)

    await USDC.connect(alice).approve(USDCVaultAddress, amount)
    await expect(vaultController.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("V_GTSTBC")
  })

  it("force error, inconsistent vault balance with deflationary token", async () => {
    const [owner, alice] = await ethers.getSigners()
    const amount = parseUnits("100", await USDC.decimals())

    const USDCVaultAddress = await vaultController.getVault(USDC.address)
    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)

    await USDC.connect(alice).approve(USDCVaultAddress, amount)

    USDC.setTransferFeeRatio(50)
    await expect(vaultController.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("V_IBA")
    USDC.setTransferFeeRatio(0)
  })

  describe("Test for transfer funds to vault", function () {
    it("Positive Test for transferFundToVault", async () => {
      const [owner, alice] = await ethers.getSigners()

      const amount = parseUnits("100", await USDC.decimals())
      await USDC.connect(owner).approve(vault.address, amount)

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount)

      // reduce owner balance
      expect(await USDC.balanceOf(owner.address)).to.eq(parseUnits("900", await USDC.decimals()))

      // increase vault balance
      expect(await USDC.balanceOf(vault.address)).to.eq(parseUnits("100", await USDC.decimals()))

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()))
    })

    it("Force error, not called by owner", async () => {
      const [owner, alice] = await ethers.getSigners()

      const amount = parseUnits("100", await USDC.decimals())
      await USDC.connect(owner).approve(vault.address, amount)

      // caller not owner
      await expect(vault.connect(alice).transferFundToVault(USDC.address, amount)).to.be.revertedWith("Vault: Not admin")
    })

    it("Check for set position address", async () => {
      const [owner, alice] = await ethers.getSigners()

      await vault.connect(owner).setPositioning(positioningConfig.address)
      expect(await vault.connect(owner).getPositioning()).to.be.equal(positioningConfig.address)
    })

    it("Check for set vault controller", async () => {
      const [owner, alice] = await ethers.getSigners()

      const vaultControllerFactory = await ethers.getContractFactory("VaultController")
      const newVaultController = await upgrades.deployProxy(vaultControllerFactory, [
        positioningConfig.address,
        accountBalance.address,
      ])
      await newVaultController.deployed()

      await vault.connect(owner).setVaultController(newVaultController.address)
      expect(await vault.connect(owner).getVaultController()).to.be.equal(newVaultController.address)
    })
  })

  describe("Test for debt repayment", function () {
    it("Positive Test for debt repayment", async () => {
      const [owner, alice] = await ethers.getSigners()

      const amount = parseUnits("100", await USDC.decimals())
      await USDC.connect(owner).approve(vault.address, amount)

      // send fund to vault
      await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
        .to.emit(vault, "BorrowFund")
        .withArgs(owner.address, amount)

      // Debt increases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()))

      // Repay debt
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount))
        .to.emit(vault, "DebtRepayed")
        .withArgs(owner.address, amount)

      // Debt decreases on vault
      expect(await vault.getTotalDebt()).to.eq(parseUnits("0", await USDC.decimals()))
    })

    it("Force error, not called by owner", async () => {
      const [owner, alice] = await ethers.getSigners()

      const amount = parseUnits("100", await USDC.decimals())
      await USDC.connect(owner).approve(vault.address, amount)

      // caller not owner
      await expect(vault.connect(alice).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith("Vault: Not admin")
    })

    it("Force error, amount is more that debt", async () => {
      const [owner, alice] = await ethers.getSigners()

      const amount = parseUnits("100", await USDC.decimals())
      await USDC.connect(owner).approve(vault.address, amount)

      // amount is more that debt
      await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith("V_AIMTD")
    })
  })

  describe("Test for getters", function () {
    it("Tests for getPositioningConfig", async function () {
      expect(await vault.getPositioningConfig()).to.be.equal(positioningConfig.address)
    })

    it("Tests for getSettlementToken", async function () {
      expect(await vault.getSettlementToken()).to.be.equal(USDC.address)
    })

    it("Tests for getAccountBalance", async function () {
      expect(await vault.getAccountBalance()).to.be.equal(accountBalance.address)
    })
  })

  describe("Test for setters", function () {
    it("Tests for setSettlementToken", async function () {
      const tokenFactory = await ethers.getContractFactory("TestERC20")
      const newUSDC = await tokenFactory.deploy()
      const NewUSDC = await newUSDC.deployed()
      await NewUSDC.__TestERC20_init("TestUSDC", "USDC", 6)

      await vault.setSettlementToken(NewUSDC.address)
      expect(await vault.getSettlementToken()).to.be.equal(NewUSDC.address)
    })
  })
})
