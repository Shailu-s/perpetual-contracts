import { parseUnits } from "ethers/lib/utils"
import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
import { IndexPriceOracle, MarkPriceOracle } from "../typechain"
import { FakeContract, smock } from '@defi-wonderland/smock';

describe("Vault Controller Mock tests for account value", function () {
    let USDC
    let positioningConfig
    let accountBalance
    let vault
    let vaultController
    let vaultFactory;
    let DAI;
    let markPriceFake: FakeContract<MarkPriceOracle>
    let indexPriceFake: FakeContract<IndexPriceOracle>
    let matchingEngineFake: FakeContract<MarkPriceOracle>
    let Positioning
    let positioning
    let VolmexPerpPeriphery
    let volmexPerpPeriphery
    let owner, alice, relayer;


    beforeEach(async function () {
        [owner, alice, relayer] = await ethers.getSigners()
        VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
        markPriceFake = await smock.fake('MarkPriceOracle')
        indexPriceFake = await smock.fake('IndexPriceOracle')
        matchingEngineFake = await smock.fake('MatchingEngine')

        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC1 = await tokenFactory.deploy()
        USDC = await USDC1.deployed()
        await USDC.__TestERC20_init("TestUSDC", "USDC", 6)

        const tokenFactory2 = await ethers.getContractFactory("TestERC20")
        const Dai = await tokenFactory2.deploy()
        DAI = await Dai.deployed()
        await DAI.__TestERC20_init("TestDai", "DAI", 18)

        const positioningConfigFactory = await ethers.getContractFactory("PositioningConfig")
        positioningConfig = await upgrades.deployProxy(
            positioningConfigFactory,
            []
        )

        const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
        accountBalance = await upgrades.deployProxy(
            accountBalanceFactory,
            [positioningConfig.address]
        )

        const vaultControllerFactory = await ethers.getContractFactory("VaultController")
        vaultController = await upgrades.deployProxy(
            vaultControllerFactory,
            [positioningConfig.address, accountBalance.address]
        )

        vaultFactory = await ethers.getContractFactory("Vault")
        vault = await upgrades.deployProxy(
            vaultFactory,
            [positioningConfig.address, accountBalance.address, USDC.address, vaultController.address, false]
        )
        await vault.deployed()

        Positioning = await ethers.getContractFactory("PositioningTest")
        positioning = await upgrades.deployProxy(
            Positioning,
            [
              positioningConfig.address,
              vaultController.address,
              accountBalance.address,
              matchingEngineFake.address,
              markPriceFake.address,
              indexPriceFake.address,
              0
            ],
            {
              initializer: "initialize",
            },
        )
        await vaultController.connect(owner).setPositioning(positioning.address)
        await vaultController.registerVault(vault.address, USDC.address)
        const amount = parseUnits("1000", await USDC.decimals())
        await USDC.mint(alice.address, amount)

        await USDC.connect(alice).approve(vaultController.address, amount)

        const DAIAmount = parseUnits("1000", await DAI.decimals())
        await DAI.mint(alice.address, DAIAmount)

        await DAI.connect(alice).approve(vaultController.address, DAIAmount)
        await USDC.mint(owner.address, DAIAmount)

        volmexPerpPeriphery = await upgrades.deployProxy(
            VolmexPerpPeriphery, 
            [
                [positioning.address, positioning.address], 
                [vaultController.address, vaultController.address],
                markPriceFake.address,
                [vault.address, vault.address],
                owner.address,
                relayer.address,
            ]
        );
    })

    it("Positive Test for single token getAccountValue", async () => {
        const [owner, alice] = await ethers.getSigners()

        const amount = parseUnits("100", await USDC.decimals())

        await positioningConfig.setSettlementTokenBalanceCap(amount)

        const USDCVaultAddress = await vaultController.getVault(USDC.address)

        const USDCVaultContract = await vaultFactory.attach(USDCVaultAddress);
        await USDC.connect(alice).approve(USDCVaultAddress, amount)
        await USDC.connect(alice).approve(volmexPerpPeriphery.address, amount)

        // check event has been sent
        await expect(vaultController.connect(alice).deposit(volmexPerpPeriphery.address, USDC.address, alice.address, amount))
            .to.emit(USDCVaultContract, "Deposited")
            .withArgs(USDC.address, alice.address, amount)

        // update sender's balance
        expect(await vaultController.getBalanceByToken(alice.address, USDC.address)).to.eq("100000000000000000000")
        expect((await vaultController.connect(positioning.address).getAccountValue(alice.address)).toString()).to.be.equal("100000000000000000000")
    })
})
