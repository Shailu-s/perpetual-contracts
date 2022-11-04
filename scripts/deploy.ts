import { ethers, upgrades, run } from "hardhat"

const deploy = async () => {
  const [owner] = await ethers.getSigners()
  console.log("Deployer: ", await owner.getAddress())
  console.log("Balance: ", (await owner.getBalance()).toString())

  const MatchingEngine = await ethers.getContractFactory("MatchingEngine")
  const PerpFactory = await ethers.getContractFactory("PerpFactory")
  const VolmexBaseToken = await ethers.getContractFactory("VolmexBaseToken")
  const MarkPriceOracle = await ethers.getContractFactory("MarkPriceOracle")
  const IndexPriceOracle = await ethers.getContractFactory("IndexPriceOracle")
  const VaultController = await ethers.getContractFactory("VaultController")
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig")
  const AccountBalance = await ethers.getContractFactory("AccountBalance")
  const Positioning = await ethers.getContractFactory("Positioning")
  const Vault = await ethers.getContractFactory("Vault")
  const TestERC20 = await ethers.getContractFactory("TestERC20")

  console.log("Deploying Index Price Oracle ...")
  const indexPriceOracle = await upgrades.deployProxy(IndexPriceOracle, [owner.address], {
    initializer: "initialize",
  })
  await indexPriceOracle.deployed()

  console.log("Deploying Base Token Impl ...")
  const volmexBaseToken = await VolmexBaseToken.deploy()
  await volmexBaseToken.deployed()

  console.log("Deploying USDC ...")
  const usdc = await TestERC20.deploy()
  await usdc.__TestERC20_init("VolmexUSDC", "VUSDC", 6)
  await usdc.deployed()

  console.log("Deploying Mark Price Oracle ...")
  const markPriceOracle = await upgrades.deployProxy(MarkPriceOracle, [[1000000], [volmexBaseToken.address]], {
    initializer: "initialize",
  })
  await markPriceOracle.deployed()

  console.log("Deploying MatchingEngine ...")
  const matchingEngine = await upgrades.deployProxy(MatchingEngine, [
    usdc.address,
    owner.address,
    markPriceOracle.address,
  ])
  await matchingEngine.deployed()

  console.log("Deploying Positioning Config Impl ...")
  const positioningConfig = await upgrades.deployProxy(PositioningConfig, [])
  await positioningConfig.deployed()

  console.log("Deploying Account Balance Impl ...")
  const accountBalance = await AccountBalance.deploy()
  await accountBalance.deployed()

  console.log("Deploying Positioning Impl ...")
  const positioning = await Positioning.deploy()
  await positioning.deployed()
  await positioning.setPositioning(positioning.address)

  console.log("Deploying Vault Impl ...")
  const vault = await Vault.deploy()
  await vault.deployed()

  console.log("Deploying Vault Controller Impl ...")
  const vaultController = await VaultController.deploy()
  await vaultController.deployed()

  console.log("Deploying Perpetual Factory ...")
  const factory = await upgrades.deployProxy(
    PerpFactory,
    [volmexBaseToken.address, vaultController.address, vault.address, positioning.address, accountBalance.address],
    {
      initializer: "initialize",
    },
  )
  await factory.deployed()

  const proxyAdmin = await upgrades.admin.getInstance()
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(indexPriceOracle.address),
    })
  } catch (error) {
    console.log("ERROR - verify - Index price oracle")
  }
  try {
    await run("verify:verify", {
      address: volmexBaseToken.address,
    })
  } catch (error) {
    console.log("ERROR - verify - base token!")
  }
  try {
    await run("verify:verify", {
      address: usdc.address,
    })
  } catch (error) {
    console.log("ERROR - verify - usdc token!")
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(markPriceOracle.address),
    })
  } catch (error) {
    console.log("ERROR - verify - mark price oracle!")
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(matchingEngine.address),
    })
  } catch (error) {
    console.log("ERROR - verify - matching engine!")
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(positioningConfig.address),
    })
  } catch (error) {
    console.log("ERROR - verify - positioning config!")
  }
  try {
    await run("verify:verify", {
      address: accountBalance.address,
    })
  } catch (error) {
    console.log("ERROR - verify - account balance!")
  }
  try {
    await run("verify:verify", {
      address: vault.address,
    })
  } catch (error) {
    console.log("ERROR - verify - vault!")
  }
  try {
    await run("verify:verify", {
      address: vaultController.address,
    })
  } catch (error) {
    console.log("ERROR - verify - vault controller!")
  }
  try {
    await run("verify:verify", {
      address: positioning.address,
    })
  } catch (error) {
    console.log("ERROR - verify - positioning!")
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(factory.address),
    })
  } catch (error) {
    console.log("ERROR - verify - factory!")
  }

  console.log("\n =====Deployment Successful===== \n")
  console.log("Index Price Oracle: ", indexPriceOracle.address)
  console.log("Mark Price Oracle: ", markPriceOracle.address)
  console.log("Matching Engine: ", matchingEngine.address)
  console.log("Perpetual Factory: ", factory.address)
}

deploy()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error)
    process.exit(1)
  })
