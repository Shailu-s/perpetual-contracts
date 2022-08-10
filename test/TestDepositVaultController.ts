import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { IndexPriceOracle, MarkPriceOracle } from "../typechain"
import { FakeContract, smock } from "@defi-wonderland/smock"

describe("Vault Controller deposit tests", function () {
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
  let Positioning
  let positioning

  beforeEach(async function () {
    const [owner, alice] = await ethers.getSigners()
    markPriceFake = await smock.fake("MarkPriceOracle")
    indexPriceFake = await smock.fake("IndexPriceOracle")

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
    vault = await upgrades.deployProxy(
        vaultFactory,
        [positioningConfig.address, accountBalance.address, USDC.address, vaultController.address, false]
    )
    DAIVault = await upgrades.deployProxy(
      vaultFactory,
      [positioningConfig.address, accountBalance.address, DAI.address, vaultController.address, false]
    )

    Positioning = await ethers.getContractFactory("PositioningTest")
    positioning = await upgrades.deployProxy(
      Positioning,
      [
        positioningConfig.address,
        vaultController.address,
        accountBalance.address,
        accountBalance.address,
        markPriceFake.address,
        indexPriceFake.address,
      ],
      {
        initializer: "__PositioningTest_init",
      },
    )

    await vaultController.connect(owner).setPositioning(positioning.address)
    await vaultController.registerVault(vault.address, USDC.address)
    await vaultController.registerVault(DAIVault.address, DAI.address)

    const amount = parseUnits("1000", await USDC.decimals())
    await USDC.mint(alice.address, amount)

    await USDC.connect(alice).approve(vaultController.address, amount)

    const DAIAmount = parseUnits("1000", await DAI.decimals())
    await DAI.mint(alice.address, DAIAmount)

    await DAI.connect(alice).approve(vaultController.address, DAIAmount)
    await USDC.mint(owner.address, DAIAmount)
  })

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

  it("Negative Test for deposit function", async () => {
    const [owner, alice] = await ethers.getSigners()

    const amount = parseUnits("100", await USDC.decimals())

    // test fail for no vault from this token
    await expect(vaultController.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("ERC20: insufficient allowance")
  })

  it("Test for deployment of vault via factory", async () => {
    const [owner, alice] = await ethers.getSigners()

    const USDCVaultAddress = await vaultController.getVault(USDC.address)

    expect(USDCVaultAddress).to.not.equal("")
  })

  it("Positive Test for multiple token deposit", async () => {
    const [owner, alice] = await ethers.getSigners()

    const amount = parseUnits("100", await USDC.decimals())
    const DAIAmount = parseUnits("100", await DAI.decimals())

    await positioningConfig.setSettlementTokenBalanceCap(amount)
    await positioningConfig.setSettlementTokenBalanceCap(DAIAmount)

    const USDCVaultAddress = await vaultController.getVault(USDC.address)
    const DAIVaultAddress = await vaultController.getVault(DAI.address)

    const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)
    const DAIVaultContract = await vaultFactory.attach(DAIVaultAddress)
    await USDC.connect(alice).approve(USDCVaultAddress, amount)
    await DAI.connect(alice).approve(DAIVaultAddress, DAIAmount)

    // check event has been sent
    await expect(vaultController.connect(alice).deposit(USDC.address, amount))
      .to.emit(USDCVaultContract, "Deposited")
      .withArgs(USDC.address, alice.address, amount)

    await expect(vaultController.connect(alice).deposit(DAI.address, DAIAmount))
      .to.emit(DAIVaultContract, "Deposited")
      .withArgs(DAI.address, alice.address, DAIAmount)

    // // reduce alice balance
    expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()))

    // // increase vault balance
    expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(parseUnits("100", await USDC.decimals()))

    // // update sender's balance
    expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))

    // // reduce alice balance
    expect(await DAI.balanceOf(alice.address)).to.eq(parseUnits("900", await DAI.decimals()))

    // // increase vault balance
    expect(await DAI.balanceOf(DAIVaultAddress)).to.eq(parseUnits("100", await DAI.decimals()))

    // // update sender's balance
    expect(await DAIVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await DAI.decimals()))
  })
})
