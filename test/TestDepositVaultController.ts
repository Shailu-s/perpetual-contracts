import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault, VaultController } from "../typechain"

describe("Vault Controller deposit tests", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
    let vaultController
    let vaultFactory
    let DAI
    let positioning
    let VaultController;

    this.beforeAll(async () => {
        VaultController = await ethers.getContractFactory("VaultController")
    });

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

        
        const positioningFactory = await ethers.getContractFactory("Positioning")
        const positioning1 = await positioningFactory.deploy()
        positioning = await positioning1.deployed()

        vaultFactory = await ethers.getContractFactory("Vault")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address, true)

        vaultController = await upgrades.deployProxy(VaultController, [
            positioning.address,
            positioningConfig.address,
            accountBalance.address,
            vault.address,
        ])
        await vaultController.deployed()

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

        await vaultController.deployVault(USDC.address,false)
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

    it("Positive Test for deposit ether function", async () => {
        const [owner, alice] = await ethers.getSigners()
        const address0 = "0x0000000000000000000000000000000000000000"
        await vaultController.deployVault(address0,true)

        const amount = ethers.utils.parseEther("1.0")
        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const EthVaultAddress = await vaultController.getVault(address0)

        const EthVaultContract = await vaultFactory.attach(EthVaultAddress)

        // check event has been sent
        await expect(vaultController.connect(alice).deposit(address0,amount,{value:amount}))
            .to.emit(EthVaultContract, "Deposited")
            .withArgs(address0, alice.address, amount)
        
        // updated balance of vault contract
        expect(await ethers.provider.getBalance(EthVaultContract.address)).to.eq(amount)
    })

    it("Negative Test for deposit function", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        // test fail for no vault from this token
        await expect(vaultController.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("VC_VOTNA")
    })

    it("Test for deployment of vault via factory", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.connect(owner).deployVault(USDC.address,false)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)

        expect(USDCVaultAddress).to.not.equal("")
    })

    it("Positive Test for multiple token deposit", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address, false)
        await vaultController.deployVault(DAI.address, false)
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
