import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, VaultController, Vault, PositioningMock, AccountBalanceMock } from "../typechain"

describe("Vault Controller tests for withdrawal", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let positioningMock: PositioningMock
    let accountBalance: AccountBalance
    let accountBalanceMock: AccountBalanceMock
    let vault: Vault
    let vaultController: VaultController
    let vaultFactory
    let DAI

    beforeEach(async function () {
        const [admin, alice] = await ethers.getSigners()

        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC1 = await tokenFactory.deploy()
        USDC = await USDC1.deployed()
        await USDC.__TestERC20_init("TestUSDC", "USDC", 18)

        const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig")
        const positioningConfig1 = await positioningConfigFactory.deploy()
        positioningConfig = await positioningConfig1.deployed()
        await positioningConfig.initialize()

        const positioningMockFactory = await ethers.getContractFactory("PositioningMock")
        const positioningMock1 = await positioningMockFactory.deploy()
        positioningMock = await positioningMock1.deployed()

        const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
        const accountBalance1 = await accountBalanceFactory.deploy()
        accountBalance = await accountBalance1.deployed()

        const accountBalanceMockFactory = await ethers.getContractFactory("AccountBalanceMock")
        const accountBalanceMock1 = await accountBalanceMockFactory.deploy()
        accountBalanceMock = await accountBalanceMock1.deployed()
        await accountBalanceMock.initialize(positioningConfig.address, positioningConfig.address)

        vaultFactory = await ethers.getContractFactory("Vault")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalanceMock.address, USDC.address, USDC.address, false)

        const vaultContractFactory = await ethers.getContractFactory("VaultController")
        const vaultContract1 = await vaultContractFactory.deploy()
        vaultController = await vaultContract1.deployed()
        await vaultController.initialize(
            positioningMock.address,
            positioningConfig.address,
            accountBalanceMock.address,
            vault.address,
        )

        await vault.setPositioning(positioningMock.address)
        const amount0 = parseUnits("10", await USDC.decimals())

        await positioningMock.mock_setFundingPaymentX10_18(amount0)
        await accountBalanceMock.mock_setOwedRealisedPnlX10_18(amount0)
        await accountBalanceMock.mock_setPendingFeeX10_18(amount0)
        await accountBalanceMock.mock_setUnrealizedPnlX10_18(amount0)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)

        await USDC.connect(alice).approve(vaultController.address, amount)
    })
    it("Positive Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address, false)
        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress)
        await USDC.connect(alice).approve(USDCVaultAddress, amount)
        await USDCVaultContract.setPositioning(positioningMock.address)
        await accountBalanceMock.connect(owner).setVault(USDCVaultAddress)

        // check event has been sent
        await expect(vaultController.connect(alice).deposit(USDC.address, amount))
            .to.emit(USDCVaultContract, "Deposited")
            .withArgs(USDC.address, alice.address, amount)

        // // update sender's balance
        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))

        await expect(vaultController.connect(alice).withdraw(USDC.address, amount))
            .to.emit(USDCVaultContract, "Withdrawn")
            .withArgs(USDC.address, alice.address, amount)

        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(0)
    })

    it("Positive Test for withdrawal of ethers", async () => {
        const [owner, alice] = await ethers.getSigners()
        const address0 = "0x0000000000000000000000000000000000000000"
        await vaultController.deployVault(address0,true)

        const amount = ethers.utils.parseEther("2.0")
        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const EthVaultAddress = await vaultController.getVault(address0)

        const EthVaultContract = await vaultFactory.attach(EthVaultAddress)
        await EthVaultContract.setPositioning(positioningMock.address)

        await accountBalanceMock.connect(owner).setVault(EthVaultAddress)
        // check event has been sent
        await expect(vaultController.connect(alice).deposit(address0,amount,{value:amount}))
            .to.emit(EthVaultContract, "Deposited")
            .withArgs(address0, alice.address, amount)
        
        expect(await ethers.provider.getBalance(EthVaultContract.address)).to.eq(amount)

        await expect(vaultController.connect(alice).withdraw(address0, amount))
            .to.emit(EthVaultContract, "Withdrawn")
            .withArgs(address0, alice.address, amount)

        expect(await (await ethers.provider.getBalance(EthVaultContract.address)).toString()).to.eq("0")
    })

    it("Negative Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await expect(vaultController.connect(alice).withdraw(USDC.address, amount)).to.be.revertedWith("VC_VOTNA")
    })
})
