import hardhat from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { Wallet, ContractFactory } from "zksync-web3";
const upgrade = async () => {
  const proxyAddress = `${process.env.PROXY_ADDRESS}`;
  const wallet = new Wallet(`${process.env.PRIVATE_KEY}`);
  const deployer = new Deployer(hardhat, wallet);
  const contractFactory = await deployer.loadArtifact(process.env.CONTRACT_NAME);
  if (process.env.IS_UPGRADE) {
    console.log("Upgrading contract ...");
    const instance = await hardhat.zkUpgrades.upgradeProxy(
      deployer.zkWallet,
      proxyAddress,
      contractFactory,
    );
    await instance.deployed();
  }
};

upgrade()
  .then(() => process.exit(0))
  .catch(error => {
    console.log("Error: ", error);
    process.exit(1);
  });
