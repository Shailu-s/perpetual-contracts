import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault, VaultController } from "../typechain"

describe("Vault Controller tests", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
    let vaultController: VaultController
    let vaultFactory;
    let DAI;
    
    beforeEach(async function () {
        const [admin, alice] = await ethers.getSigners()

        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC1 = await tokenFactory.deploy()
        USDC = await USDC1.deployed()
        await USDC.__TestERC20_init("TestUSDC", "USDC", 6)

        const tokenFactory2 = await ethers.getContractFactory("TestERC20")
        const Dai = await tokenFactory2.deploy()
        DAI = await Dai.deployed()
        await DAI.__TestERC20_init("TestDai", "DAI", 10)

        const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig")
        const positioningConfig1 = await positioningConfigFactory.deploy()
        positioningConfig = await positioningConfig1.deployed()
        await positioningConfig.initialize()

        const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
        const accountBalance1 = await accountBalanceFactory.deploy()
        accountBalance = await accountBalance1.deployed()

        vaultFactory = await ethers.getContractFactory("Vault")
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

        const DAIAmount = parseUnits("1000", await DAI.decimals())
        await DAI.mint(alice.address, DAIAmount)

        await DAI.connect(alice).approve(vaultController.address, DAIAmount)
        await USDC.mint(admin.address, DAIAmount)
    })

    it("Positive Test for deposit function", async () => {
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
        await expect(vaultController.connect(alice).deposit(USDC.address, amount))
            .to.be.revertedWith("VC_VOTNA")
    })

    it("Positive Test for multiple token deposit", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address)
        await vaultController.deployVault(DAI.address)
        const amount = parseUnits("100", await USDC.decimals())
        const DAIAmount = parseUnits("100", await DAI.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)
        await positioningConfig.setSettlementTokenBalanceCap(DAIAmount)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)
        const DAIVaultAddress = await vaultController.getVault(DAI.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        const DAIVaultContract = await vaultFactory.attach(DAIVaultAddress);
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
