import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault, VaultController, VaultMock } from "../typechain"

describe("Vault tests for withdrawals", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
    let vaultMock: VaultMock
    let vaultController: VaultController
    let vaultFactory
    let USDCVaultContract
    let positioning

    beforeEach(async function () {
        const [admin, alice] = await ethers.getSigners()

        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC1 = await tokenFactory.deploy()
        USDC = await USDC1.deployed()
        await USDC.__TestERC20_init("TestUSDC", "USDC", 6)

        const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig")
        const positioningConfig1 = await positioningConfigFactory.deploy()
        positioningConfig = await positioningConfig1.deployed()
        await positioningConfig.initialize()

        const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
        const accountBalance1 = await accountBalanceFactory.deploy()
        accountBalance = await accountBalance1.deployed()

        const positioningFactory = await ethers.getContractFactory("Positioning")
        const positioning1 = await positioningFactory.deploy()
        positioning = await positioning1.deployed()

        vaultFactory = await ethers.getContractFactory("Vault")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address, false)

        const vaultMockFactory = await ethers.getContractFactory("VaultMock")
        const vaultMock1 = await vaultMockFactory.deploy()
        vaultMock = await vaultMock1.deployed()
        await vaultMock.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address, false)
        
        const vaultControllerFactory = await ethers.getContractFactory("VaultController")
        const vaultController1 = await vaultControllerFactory.deploy()
        vaultController = await vaultController1.deployed()
        await vaultController.initialize(positioning.address, positioningConfig.address, accountBalance.address, vaultMock.address)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)
        await USDC.connect(alice).approve(vaultMock.address, amount)

        await USDC.mint(admin.address, amount)

        await vaultMock._mock_setOwedRealisedPnlX10_18(0)
        await vaultMock._mock_setFundingPaymentX10_18(0)
        await vaultMock._mock_setUnrealizedPnlX10_18(0)
        await vaultMock._mock_setPendingFeeX10_18(0)
    })
    describe("Test for Withdrawal", function () {
        beforeEach(async function () {
            const [owner, alice] = await ethers.getSigners()

            await vaultController.deployVault(USDC.address, false)
            const amount = parseUnits("100", await USDC.decimals())
    
            await positioningConfig.setSettlementTokenBalanceCap(amount)
    
            const USDCVaultAddress = await vaultController.getVault(USDC.address)
    
            USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
            await USDC.connect(alice).approve(USDCVaultAddress, amount)
    
            // check event has been sent
            await expect(vaultController.connect(alice).deposit(USDC.address, amount))
                .to.emit(USDCVaultContract, "Deposited")
                .withArgs(USDC.address, alice.address, amount)
        })

        it("Tests for success withdrawal", async function () {
            const [owner, alice] = await ethers.getSigners()
            const amount = parseUnits("100", await USDC.decimals())

            await expect(vaultController.connect(alice).withdraw(USDC.address, amount))
                .to.emit(USDCVaultContract, "Withdrawn")
                .withArgs(USDC.address, alice.address, amount)

            expect(await vaultMock.getBalance(alice.address)).to.eq(parseUnits("0", await USDC.decimals()))
        })

        it("Tests for not enough free collateral error", async function () {
            const [owner, alice] = await ethers.getSigners()
            const amount = parseUnits("200", await USDC.decimals())

            await expect(vaultController.connect(alice).withdraw(USDC.address, amount))
                .to.be.revertedWith("V_NEFC")

        })
    })
})
