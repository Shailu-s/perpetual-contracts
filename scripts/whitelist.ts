import { ethers } from "hardhat";
import { BigNumber } from "ethers";
// yarn hardhat run scripts/whitelist.ts --network base-goerli --no-compile

import { config as dotEnvConfig } from "dotenv";
import { constants } from "./chains";
dotEnvConfig();

const contracts = constants["base-goerli-staging"];
const rpcUrl = contracts.RPC_URL;
const TRADER_TO_WHITELIST = "0xcfEBfD8278D41078c8f0ad8C6a867bA8ACb7a093";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const account0 = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account

  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const VirtualToken = await ethers.getContractFactory("VirtualToken");

  const perpPeriphery = await VolmexPerpPeriphery.attach(contracts.PERIPHERY);
  const virtualToken = await VirtualToken.attach(contracts.USDC);

  const res1 = await perpPeriphery.connect(account0).whitelistTrader(TRADER_TO_WHITELIST, true);
  const f = await res1.wait();
  console.log("f", f.transactionHash);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
