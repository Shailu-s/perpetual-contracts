import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, VaultController, VaultMock } from "../typechain"

describe("Vault Controller tests for withdrawal", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: VaultMock
    let vaultController: VaultController
    let vaultFactory;
    
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

        vaultFactory = await ethers.getContractFactory("VaultMock")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address)

        const vaultControllerFactory = await ethers.getContractFactory("VaultController")
        const vaultController1 = await vaultControllerFactory.deploy()
        vaultController = await vaultController1.deployed()
        await vaultController.initialize(positioningConfig.address, accountBalance.address, vault.address)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)

        await USDC.connect(alice).approve(vaultController.address, amount)
    })

    it("Positive Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address)
        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        await USDC.connect(alice).approve(USDCVaultAddress, amount)

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

    it("Negative Test for withdrawal of token", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await expect(vaultController.connect(alice).withdraw(USDC.address, amount))
        .to.be.revertedWith("VC_VOTNA")
    })
})
