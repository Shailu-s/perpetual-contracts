import { expect } from "chai"
import { ethers, upgrades } from "hardhat"
const { Order, Asset, sign } = require('../order');
import { FakeContract, smock } from '@defi-wonderland/smock';
import { AccountBalance, FundingRate, IndexPriceOracle, MarkPriceOracle, PositioningTest } from "../../typechain";


describe("Positioning", function () {
    let MatchingEngine
    let matchingEngine
    let VirtualToken
    let virtualToken
    let erc20TransferProxy
    let ERC20TransferProxyTest
    let TransferManagerTest
    let community
    let ERC1271Test
    let erc1271Test
    let asset
    let Positioning
    let positioning
    let PositioningConfig
    let positioningConfig
    let Vault
    let vault
    let AccountBalance
    let markPriceFake: FakeContract<MarkPriceOracle>
    let indexPriceFake: FakeContract<IndexPriceOracle>
    let accountBalance: FakeContract<AccountBalance>
    let transferManagerTest
    let ExchangeTest;
    let exchangeTest;

    this.beforeAll(async () => {
        MatchingEngine = await ethers.getContractFactory("MatchingEngineTest")
        VirtualToken = await ethers.getContractFactory("VirtualToken")
        ERC20TransferProxyTest = await ethers.getContractFactory("ERC20TransferProxyTest")
        TransferManagerTest = await ethers.getContractFactory("TransferManagerTest")
        ERC1271Test = await ethers.getContractFactory("ERC1271Test")
        Positioning = await ethers.getContractFactory("PositioningTest")
        PositioningConfig = await ethers.getContractFactory("PositioningConfig")
        Vault = await ethers.getContractFactory("Vault")
        AccountBalance = await ethers.getContractFactory("AccountBalance")
        ExchangeTest = await ethers.getContractFactory("ExchangeTest");
    })

    beforeEach(async () => {
        const [owner, account1, account2, account3, account4] = await ethers.getSigners()

        markPriceFake = await smock.fake('MarkPriceOracle');
        indexPriceFake = await smock.fake('IndexPriceOracle')
        erc20TransferProxy = await ERC20TransferProxyTest.deploy()
        erc1271Test = await ERC1271Test.deploy()
        accountBalance = await smock.fake("AccountBalance")
        community = account4.address
        exchangeTest = await ExchangeTest.deploy()

        positioningConfig = await upgrades.deployProxy(
            PositioningConfig,
            []
        )

        accountBalance
        matchingEngine = await upgrades.deployProxy(
            MatchingEngine,
            [erc20TransferProxy.address, 300, community, owner.address],
            {
                initializer: "__MatchingEngineTest_init",
            },
        )
        virtualToken = await upgrades.deployProxy(VirtualToken, ["Virtual Ethereum", "VETH", true], {
            initializer: "__VirtualToken_init",
        })
        asset = Asset(virtualToken.address, "10")

        vault = await upgrades.deployProxy(
            Vault,
            [positioningConfig.address, accountBalance.address, virtualToken.address, accountBalance.address, false]
        )

        transferManagerTest = await upgrades.deployProxy(TransferManagerTest, [1, community], {
            initializer: "__TransferManager_init",
        })
        positioning = await upgrades.deployProxy(
            Positioning,
            [positioningConfig.address, vault.address, accountBalance.address,matchingEngine.address,markPriceFake.address, indexPriceFake.address, 0],
            {
                initializer: "__PositioningTest_init",
            },
        )
        await accountBalance.connect(owner).setPositioning(positioning.address)
        await vault.setPositioning(positioning.address)
        await positioningConfig.connect(owner).setMaxMarketsPerAccount(5)
    })

    describe("Deployment", function () {
        it("MatchingEngine deployed confirm", async () => {
            let receipt = await matchingEngine.deployed()
            expect(receipt.confirmations).not.equal(0)
        })
        it("Positioning deployed confirm", async () => {
            let receipt = await positioning.deployed()
            expect(receipt.confirmations).not.equal(0)
        })
    })

    describe("Match orders:", function () {
        describe("Success:", function () {
            it("should match orders & emit event", async () => {
                const [owner, account1, account2] = await ethers.getSigners()

                markPriceFake.getCumulativePrice.returns(10);
                indexPriceFake.getIndexTwap.returns([1, 2, 3])
                await virtualToken.mint(account1.address, 1000000000000000)
                await virtualToken.mint(account2.address, 1000000000000000)
                await virtualToken.addWhitelist(account1.address)
                await virtualToken.addWhitelist(account2.address)
                await virtualToken.connect(account1).approve(matchingEngine.address, 1000000000000000)
                await virtualToken.connect(account2).approve(matchingEngine.address, 1000000000000000)
                await virtualToken.connect(account1).approve(positioning.address, 1000000000000000)
                await virtualToken.connect(account2).approve(positioning.address, 1000000000000000)
        
                const orderLeft = Order(
                  account1.address,
                  87654321987654,
                  true,
                  Asset(virtualToken.address, "20"),
                  Asset(virtualToken.address, "20"),
                  1
                )
        
                const orderRight = Order(
                  account2.address,
                  87654321987654,
                  false,
                  Asset(virtualToken.address, "20"),
                  Asset(virtualToken.address, "20"),
                  1,
                )
        
                let signatureLeft = await getSignature(orderLeft, account1.address)
                let signatureRight = await getSignature(orderRight, account2.address)

                await expect(positioning.connect(owner).openPosition(orderLeft, signatureLeft, orderRight, signatureRight)).to.emit(
                    positioning,
                    "PositionChanged",
                )
            })
        })
    })
    async function getSignature(orderObj, signer) {
        return sign(orderObj, signer, matchingEngine.address)
    }
})
