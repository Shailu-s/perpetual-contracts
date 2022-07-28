import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, AccountBalanceMock, PositioningConfig, PositioningMock, TestERC20, Vault, VaultController } from "../typechain"

describe("Vault Controller Mock tests for account value", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let positioningMock: PositioningMock
    let accountBalance: AccountBalance
    let accountBalanceMock: AccountBalanceMock
    let vault: Vault
    let vaultContract: VaultController
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
        await DAI.__TestERC20_init("TestDai", "DAI", 18)

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

        vaultFactory = await ethers.getContractFactory("Vault")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address)

        const vaultContractFactory = await ethers.getContractFactory("VaultController")
        const vaultContract1 = await vaultContractFactory.deploy()
        vaultContract = await vaultContract1.deployed()
        await vaultContract.initialize(positioningMock.address,positioningConfig.address, accountBalanceMock.address, vault.address)

        const amount0 = parseUnits("10", await DAI.decimals())

        await positioningMock.mock_setFundingPaymentX10_18(amount0)
        await accountBalanceMock.mock_setOwedRealisedPnlX10_18(amount0)
        await accountBalanceMock.mock_setPendingFeeX10_18(amount0)
        await accountBalanceMock.mock_setUnrealizedPnlX10_18(amount0)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)

        await USDC.connect(alice).approve(vaultContract.address, amount)

        const DAIAmount = parseUnits("1000", await DAI.decimals())
        await DAI.mint(alice.address, DAIAmount)

        await DAI.connect(alice).approve(vaultContract.address, DAIAmount)
        await USDC.mint(admin.address, DAIAmount)
    })

    it("Positive Test for single token getAccountValue", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultContract.deployVault(USDC.address)
        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultContract.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        await USDC.connect(alice).approve(USDCVaultAddress, amount)

        // check event has been sent
        await expect(vaultContract.connect(alice).deposit(USDC.address, amount))
            .to.emit(USDCVaultContract, "Deposited")
            .withArgs(USDC.address, alice.address, amount)
        

        // // update sender's balance
        expect(await USDCVaultContract.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))
        expect((await vaultContract.getAccountValue(alice.address)).toString()).to.be.equal("120000000000000000000")
    })
})
