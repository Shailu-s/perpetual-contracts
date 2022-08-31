import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { MarkPriceOracle, IndexPriceOracle } from "../typechain"
import { FakeContract, smock } from "@defi-wonderland/smock"

describe("Vault Controller tests for withdrawal", function () {
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
    vault = await upgrades.deployProxy(
        vaultFactory,
        [positioningConfig.address, accountBalance.address, USDC.address, vaultController.address, false]
    )
    await accountBalance.grantSettleRealizedPnlRole(vaultController.address);
    await accountBalance.grantSettleRealizedPnlRole(vault.address);

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

    await accountBalance.connect(owner).setVault(vault.address)
    const amount = parseUnits("1000", await USDC.decimals())
    await USDC.mint(alice.address, amount)

    await USDC.connect(alice).approve(vaultController.address, amount)

    const DAIAmount = parseUnits("1000", await DAI.decimals())
    await DAI.mint(alice.address, DAIAmount)

    await DAI.connect(alice).approve(vaultController.address, DAIAmount)
    await USDC.mint(owner.address, DAIAmount)
    })
    it("Positive Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)
        await USDC.connect(alice).approve(USDCVaultAddress, amount)
        await USDCVaultContract.setPositioning(positioning.address)

        // check event has been sent
        await expect(vaultController.connect(alice).deposit(USDC.address, amount))
            .to.emit(USDCVaultContract, "Deposited")

        // // update sender's balance
        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))

        await expect(vaultController.connect(alice).withdraw(USDC.address, amount))
            .to.emit(USDCVaultContract, "Withdrawn")
    })

    it("Negative Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await expect(vaultController.connect(alice).withdraw(USDC.address, amount)).to.be.revertedWith("V_NEFC")
    })
})
