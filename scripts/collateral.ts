import { ethers, run } from "hardhat";

const collateral = async () => {
  const TetherToken = await ethers.getContractFactory("TetherToken");
  const VaultController = await ethers.getContractFactory("VaultController");
  const Vault = await ethers.getContractFactory("Vault");
  const vaultController = process.env.VAULT_CONTROLLER;
  const vault = process.env.VAULT;

  console.log("Collateral deploying ...");
  const collateralToken = await TetherToken.deploy("1000000000000000000", "Tether USD", "USDT", 6);
  await collateralToken.deployed();
  const vaultInstance = Vault.attach(vault);
  const vaultControllerInstance = VaultController.attach(vaultController);
  console.log("Set collateral");
  await (await vaultInstance.setSettlementToken(collateralToken.address)).wait();
  console.log("Register vault ...");
  await (
    await vaultControllerInstance.registerVault(vaultInstance.address, collateralToken.address)
  ).wait();
  console.log("Collateral: ", collateralToken.address);
  try {
    await run("verify:verify", {
      address: collateralToken.address,
      constructorArguments: ["1000000000000000000", "Tether USD", "USDT", 6],
    });
  } catch (error) {
    console.log("ERROR - verify - usdc token!");
  }
};
collateral()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
