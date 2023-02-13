import { ethers, upgrades, run } from "hardhat";

const vault = async () => {
  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const Vault = await ethers.getContractFactory("Vault");
  const VaultController = await ethers.getContractFactory("VaultController");
  const VolmexPerpView = await ethers.getContractFactory("VolmexPerpView");
  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");

  console.log("Deploying collateral token ...");
  const collateral = await upgrades.deployProxy(TestERC20, ["Dai Stablecoin", "DAI", 18], {
    initializer: "__TestERC20_init",
  });
  await collateral.deployed();

  console.log("Deploying Vault ...");
  const vault = await upgrades.deployProxy(Vault, [
    `${process.env.POSITIONING_CONFIG}`,
    `${process.env.ACCOUNT_BALANCE}`,
    collateral.address,
    `${process.env.VAULT_CONTROLLER}`,
    false,
  ]);
  await vault.deployed();
  const perpView = VolmexPerpView.attach(`${process.env.PERP_VIEW}`);
  const periphery = VolmexPerpPeriphery.attach(`${process.env.PERIPHERY}`);
  await (await perpView.incrementVaultIndex()).wait();
  console.log("Whitelist vault ...");
  await (await periphery.whitelistVault(vault.address, true)).wait();

  console.log("Register vault ...");
  const vaultController = VaultController.attach(`${process.env.VAULT_CONTROLLER}`);
  await (await vaultController.registerVault(vault.address, collateral.address)).wait();

  console.log("\nDeployment successful!!!");
  console.log("Collateral: ", collateral.address);
  console.log("Vault: ", vault.address, "\n\n\n\n");

  const proxyAdmin = await upgrades.admin.getInstance();
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(vault.address),
    });
  } catch (error) {
    console.log("ERROR - verify - vault!");
  }
  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(collateral.address),
    });
  } catch (error) {
    console.log("ERROR - verify - collateral!");
  }
};

vault()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
