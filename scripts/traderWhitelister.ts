import { ethers } from "hardhat";
import { BigNumber, Wallet } from "ethers";
import { constants } from "./chains";
// yarn hardhat run scripts/traderWhitelister.ts --network base-goerli --no-compile
const contracts = constants["arbitrum-goerli"]
const rpcUrl = constants["arbitrum-goerli"].RPC_URL;


// this script will grant the traderWhitelister role to the following address
const traderWhitelisterAddress = '0xD0eA56Be31A8df5F4F1E599F1c822c6b46C2f2Cd' ?? new Wallet(
  process.env.TRADER_WHITELISTER_PRIVATE_KEY
).address;

async function openPosition() {
  const provider = new ethers.providers.JsonRpcProvider(
    rpcUrl,
  );
  const account0 = new ethers.Wallet( // deployer account
    process.env.DEPLOYER_PRIVATE_KEY,
    provider,
  );

  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const VirtualToken = await ethers.getContractFactory("VirtualToken");

  const perpPeriphery = await VolmexPerpPeriphery.attach(contracts.PERIPHERY);
  const virtualToken = await VirtualToken.attach(contracts.USDC);

  const TRADER_WHITELISTER_ROLE = await perpPeriphery.TRADER_WHITELISTER();



  const res1 = await perpPeriphery
    .connect(account0)
    .grantRole(TRADER_WHITELISTER_ROLE, traderWhitelisterAddress, {
      gasPrice: 1800000000,
    });
  const res2 = await res1.wait();
  console.log("res2", res2.transactionHash);

  
}

openPosition()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
