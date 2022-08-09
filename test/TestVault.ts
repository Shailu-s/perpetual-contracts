import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { AccountBalance, PositioningConfig, TestERC20, Vault, VaultController, Vault__factory } from "../typechain"

describe("Vault tests", function () {
    let USDC: TestERC20
    let positioningConfig: PositioningConfig
    let accountBalance: AccountBalance
    let vault: Vault
    let vaultController: VaultController
    let vaultFactory;
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
        await vault.initialize(positioningConfig.address, accountBalance.address, USDC.address, USDC.address, false)

        const positioningFactory = await ethers.getContractFactory("Positioning")
        const positioning1 = await positioningFactory.deploy()
        positioning = await positioning1.deployed()

        const vaultControllerFactory = await ethers.getContractFactory("VaultController")
        const vaultController1 = await vaultControllerFactory.deploy()
        vaultController = await vaultController1.deployed()
        await vaultController.initialize(positioning.address, positioningConfig.address, accountBalance.address, vault.address)

        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)
        await USDC.connect(alice).approve(vault.address, amount)

        await USDC.mint(admin.address, amount)
    })
    // @SAMPLE - deposit
    it("Positive Test for deposit function", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address, false)
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

    it("force error, insufficient allowance", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address, false)
        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        await expect(vaultController.connect(owner).deposit(USDC.address, amount)).to.be.revertedWith(
            "ERC20: insufficient allowance",
        )
    })

    it("force error, greater than settlement token balance cap", async () => {
        const [owner, alice] = await ethers.getSigners()

        await vaultController.deployVault(USDC.address, false)
        const amount = parseUnits("100", await USDC.decimals())

        const USDCVaultAddress = await vaultController.getVault(USDC.address)
        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);

        await USDC.connect(alice).approve(USDCVaultAddress, amount)
        await expect(vaultController.connect(alice).deposit(USDC.address, amount)).to.be.revertedWith("V_GTSTBC")
    })

    it("force error, inconsistent vault balance with deflationary token", async () => {
        const [owner, alice] = await ethers.getSigners()
        await vaultController.deployVault(USDC.address, false)
        const amount = parseUnits("100", await USDC.decimals())

        const USDCVaultAddress = await vaultController.getVault(USDC.address)
        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        
        await USDC.connect(alice).approve(USDCVaultAddress, amount)

        USDC.setTransferFeeRatio(50)
        await expect(
            vaultController.connect(alice).deposit(USDC.address,amount),
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

        it("Check for set position address", async () => {
            const [owner, alice] = await ethers.getSigners()
    
            await vault.connect(owner).setPositioning(positioningConfig.address)
            expect( await vault.connect(owner).getPositioning()).to.be.equal(positioningConfig.address)
        })

        it("Check for set vault controller", async () => {
            const [owner, alice] = await ethers.getSigners()

            const newVaultController = await upgrades.deployProxy(VaultController, [
                positioning.address,
                positioningConfig.address,
                accountBalance.address,
                vault.address,
            ])
            await newVaultController.deployed()

            await vault.connect(owner).setVaultController(newVaultController.address)
            expect( await vault.connect(owner).getVaultController()).to.be.equal(newVaultController.address)
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
