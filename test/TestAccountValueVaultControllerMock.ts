import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault, VaultControllerMock } from "../typechain"

describe("Vault Controller Mock tests for account value", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
    let vaultContractMock: VaultControllerMock
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

        const vaultContractMockFactory = await ethers.getContractFactory("VaultControllerMock")
        const vaultContractMock1 = await vaultContractMockFactory.deploy()
        vaultContractMock = await vaultContractMock1.deployed()
        await vaultContractMock.initialize(positioningConfig.address, accountBalance.address, vault.address)

        await vaultContractMock._mock_setFundingPaymentX10_18(0)
        await vaultContractMock._mock_setOwedRealisedPnlX10_18(0)
        await vaultContractMock._mock_setPendingFeeX10_18(0)
        await vaultContractMock._mock_setUnrealizedPnlX10_18(0)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)

        await USDC.connect(alice).approve(vaultContractMock.address, amount)

        const DAIAmount = parseUnits("1000", await DAI.decimals())
        await DAI.mint(alice.address, DAIAmount)

        await DAI.connect(alice).approve(vaultContractMock.address, DAIAmount)
        await USDC.mint(admin.address, DAIAmount)
    })

    it("Positive Test for single token getAccountValue", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultContractMock.deployVault(USDC.address)
        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultContractMock.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        await USDC.connect(alice).approve(USDCVaultAddress, amount)

        // check event has been sent
        await expect(vaultContractMock.connect(alice).deposit(USDC.address, amount))
            .to.emit(USDCVaultContract, "Deposited")
            .withArgs(USDC.address, alice.address, amount)

        // // update sender's balance
        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))
        expect(await (await vaultContractMock.getAccountValue(alice.address)).value.toNumber()).to.be.equal(100000000000000000000)
    })

    it("Positive Test for multiple token deposit", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultContractMock.deployVault(USDC.address)
        await vaultContractMock.deployVault(DAI.address)
        const amount = parseUnits("100", await USDC.decimals())
        const DAIAmount = parseUnits("100", await DAI.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)
        await positioningConfig.setSettlementTokenBalanceCap(DAIAmount)

        const USDCVaultAddress = await vaultContractMock.getVault(USDC.address)
        const DAIVaultAddress = await vaultContractMock.getVault(DAI.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        const DAIVaultContract = await vaultFactory.attach(DAIVaultAddress);
        await USDC.connect(alice).approve(USDCVaultAddress, amount)
        await DAI.connect(alice).approve(DAIVaultAddress, DAIAmount)

        // check event has been sent
        await expect(vaultContractMock.connect(alice).deposit(USDC.address, amount))
            .to.emit(USDCVaultContract, "Deposited")
            .withArgs(USDC.address, alice.address, amount)

        await expect(vaultContractMock.connect(alice).deposit(DAI.address, DAIAmount))
            .to.emit(DAIVaultContract, "Deposited")
            .withArgs(DAI.address, alice.address, DAIAmount)

        // // reduce alice balance
        expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()))

        // // increase vault balance
        expect(await USDC.balanceOf(USDCVaultAddress)).to.eq(parseUnits("100", await USDC.decimals()))

        // // update sender's balance
        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))

        expect(await DAI.balanceOf(DAIVaultAddress)).to.eq(parseUnits("100", await DAI.decimals()))
        expect(await (await vaultContractMock.getAccountValue(alice.address)).value.toNumber()).to.be.equal(200000000000000000000)
    })
})
