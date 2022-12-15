import { ethers, upgrades, run } from "hardhat";

const upgrade = async () => {
  const proxyAddress = `${process.env.PROXY_ADDRESS}`;

  const contractFactory = await ethers.getContractFactory(process.env.CONTRACT_NAME);

  console.log("Upgrading contract ...")
  const instance = await upgrades.upgradeProxy(proxyAddress, contractFactory);
  const proxyAdmin = await upgrades.admin.getInstance();
  console.log("Upgraded!")

  const implementation = await proxyAdmin.getProxyImplementation(instance.address);

  console.log("Verifying implementation ...", implementation)
  await run("verify:verify", {
    address: implementation,
  });

  console.log("\nVolmex Protocol implementation upgraded");
};

upgrade()
  .then(() => process.exit(0))
  .catch((error) => {
    console.log("Error: ", error);
    process.exit(1);
  });