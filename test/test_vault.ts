import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault } from "../typechain"

describe("Vault tests", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
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

        const vaultFactory = await ethers.getContractFactory("Vault")
        const vault1 = await vaultFactory.deploy()
        vault = await vault1.deployed()
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)
        await USDC.connect(alice).approve(vault.address, amount)

        await USDC.mint(admin.address, amount)

    })
    // @SAMPLE - deposit
    it("Positive Test for deposit function", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())
        await positioningConfig.setSettlementTokenBalanceCap(amount)

        // check event has been sent
        await expect(vault.connect(alice).deposit(USDC.address, amount))
            .to.emit(vault, "Deposited")
            .withArgs(USDC.address, alice.address, amount)

        // reduce alice balance
        expect(await USDC.balanceOf(alice.address)).to.eq(parseUnits("900", await USDC.decimals()))

        // increase vault balance
        expect(await USDC.balanceOf(vault.address)).to.eq(parseUnits("100", await USDC.decimals()))

        // update sender's balance
        expect(await vault.getBalance(alice.address)).to.eq(parseUnits("100", await USDC.decimals()))
    })
})
