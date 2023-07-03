import { ethers } from "hardhat";
import { BigNumber, Wallet } from "ethers";
import { constants } from "./chains";

// liquidator needs TRADER_WHITELISTER and liquidator role and some stable coins deposited into vault

const STABLE_COINS_AMOUNT = ethers.utils.parseUnits("1000000", 6);

// yarn hardhat run scripts/setupLiquidator.ts --network base-goerli --no-compile
const contracts = constants["arbitrum-goerli"];
const rpcUrl = contracts.RPC_URL;

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const liquidatorAddress = "0xc9132B6Ac716a84CB6705AA27eE05Ed7be7b97D7"
const account0 = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account
let tx
async function setupLiquidator() {
  const VirtualToken = await ethers.getContractFactory("VirtualToken");
  const virtualToken = await VirtualToken.attach(contracts.USDC);
  
  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const perpPeriphery = await VolmexPerpPeriphery.attach(contracts.PERIPHERY);

  const Positioning = await ethers.getContractFactory("PositioningTest");
  const positioning = await Positioning.attach(contracts.POSITIONING);

  const isTraderWhitelisted = await perpPeriphery.isTraderWhitelisted(liquidatorAddress);

  if (isTraderWhitelisted) {
    console.log('already whitelisted')
  } else {
    tx = await perpPeriphery
    .connect(account0)
    .whitelistTrader(liquidatorAddress, true, { gasLimit: 20000000, gasPrice: 1600000000 });
    tx.wait()
    console.log("whitelisted trader", tx.hash)
  }

  const isLiquidator = await positioning.isLiquidatorWhitelisted(liquidatorAddress)

  if (isLiquidator) {
    console.log('already liquidator')
  } else {
    tx = await positioning
    .connect(account0)
    .whitelistLiquidator(liquidatorAddress, true, { gasLimit: 20000000, gasPrice: 1600000000 });
    tx.wait()
    console.log("whitelisted liquidator", tx.hash)
  }

  // TODO: add stable coins to liquidator and deposit



}

setupLiquidator()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
