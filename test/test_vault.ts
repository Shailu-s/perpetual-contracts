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

    it("force error,amount more than allowance", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await expect(vault.connect(owner).deposit(USDC.address, amount)).to.be.revertedWith(
            "ERC20: transfer amount exceeds allowance",
        )
    })

    it("force error, greater than settlement token balance cap", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await expect(vault.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("V_GTSTBC")
    })

    it("force error, inconsistent vault balance with deflationary token", async () => {
        const [owner, alice] = await ethers.getSigners()

        USDC.setTransferFeeRatio(50)
        await expect(
            vault.connect(alice).deposit(USDC.address, parseUnits("100", await USDC.decimals())),
        ).to.be.revertedWith("V_IBA")
        USDC.setTransferFeeRatio(0)
    })

    describe("Test for transfer funds to vault", function () {
        it("Positive Test for transferFundToVault", async () => {
            const [owner, alice] = await ethers.getSigners()

            const amount = parseUnits("100", await USDC.decimals())
            await USDC.connect(owner).approve(vault.address, amount)

            // send fund to vault
            await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
                .to.emit(vault, "BorrowFund")
                .withArgs(owner.address, amount)

            // reduce owner balance
            expect(await USDC.balanceOf(owner.address)).to.eq(parseUnits("900", await USDC.decimals()))

            // increase vault balance
            expect(await USDC.balanceOf(vault.address)).to.eq(parseUnits("100", await USDC.decimals()))

            // Debt increases on vault
            expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()))
        })

        it("Force error, not called by owner", async () => {
            const [owner, alice] = await ethers.getSigners()

            const amount = parseUnits("100", await USDC.decimals())
            await USDC.connect(owner).approve(vault.address, amount)

            // caller not owner
            await expect(vault.connect(alice).transferFundToVault(USDC.address, amount)).to.be.revertedWith("SO_CNO")
        })
    })

    describe("Test for debt repayment", function () {
        it("Positive Test for debt repayment", async () => {
            const [owner, alice] = await ethers.getSigners()

            const amount = parseUnits("100", await USDC.decimals())
            await USDC.connect(owner).approve(vault.address, amount)

            // send fund to vault
            await expect(vault.connect(owner).transferFundToVault(USDC.address, amount))
                .to.emit(vault, "BorrowFund")
                .withArgs(owner.address, amount)

            // Debt increases on vault
            expect(await vault.getTotalDebt()).to.eq(parseUnits("100", await USDC.decimals()))

            // Repay debt
            await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount))
                .to.emit(vault, "DebtRepayed")
                .withArgs(owner.address, amount)

            // Debt decreases on vault
            expect(await vault.getTotalDebt()).to.eq(parseUnits("0", await USDC.decimals()))
        })

        it("Force error, not called by owner", async () => {
            const [owner, alice] = await ethers.getSigners()

            const amount = parseUnits("100", await USDC.decimals())
            await USDC.connect(owner).approve(vault.address, amount)

            // caller not owner
            await expect(vault.connect(alice).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith("SO_CNO")
        })

        it("Force error, amount is more that debt", async () => {
            const [owner, alice] = await ethers.getSigners()

            const amount = parseUnits("100", await USDC.decimals())
            await USDC.connect(owner).approve(vault.address, amount)

            // amount is more that debt
            await expect(vault.connect(owner).repayDebtToOwner(USDC.address, amount)).to.be.revertedWith("V_AIMTD")
        })
    })

    describe("Test for getters", function () {
        it("Tests for getPositioningConfig", async function () {
            expect(await vault.getPositioningConfig()).to.be.equal(positioningConfig.address)
        })

        it("Tests for getSettlementToken", async function () {
            expect(await vault.getSettlementToken()).to.be.equal(USDC.address)
        })

        it("Tests for getAccountBalance", async function () {
            expect(await vault.getAccountBalance()).to.be.equal(accountBalance.address)
        })
    })

    describe("Test for setters", function () {
        it("Tests for setSettlementToken", async function () {
            const tokenFactory = await ethers.getContractFactory("TestERC20")
            const newUSDC = await tokenFactory.deploy()
            const NewUSDC = await newUSDC.deployed()
            await NewUSDC.__TestERC20_init("TestUSDC", "USDC", 6)

            await vault.setSettlementToken(NewUSDC.address)
            expect(await vault.getSettlementToken()).to.be.equal(NewUSDC.address)
        })
    })
})
