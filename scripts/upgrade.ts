import { ethers, upgrades, run } from "hardhat";

const upgrade = async () => {
  const proxyAddress = `${process.env.PROXY_ADDRESS}`;

  const contractFactory = await ethers.getContractFactory(process.env.CONTRACT_NAME);

  console.log("Upgrading contract ...");
  // await upgrades.forceImport(proxyAddress, contractFactory);
  const instance = await upgrades.upgradeProxy(proxyAddress, contractFactory);
  await instance.deployed();
  const proxyAdmin = await upgrades.admin.getInstance();
  console.log("Upgraded!");

  console.log(
    "Verifying implementation ...",
    await proxyAdmin.getProxyImplementation(instance.address),
  );

  try {
    await run("verify:verify", {
      address: await proxyAdmin.getProxyImplementation(instance.address),
    });
  } catch (error) {
    console.log("Unable to verify", error);
  }
};

upgrade()
  .then(() => process.exit(0))
  .catch(error => {
    console.log("Error: ", error);
    process.exit(1);
  });
