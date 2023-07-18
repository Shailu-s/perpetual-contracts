import { ethers } from "hardhat";
import { BigNumber, Wallet } from "ethers";
import { constants } from "./chains";

// yarn hardhat run scripts/setupLiquidator.ts --network base-goerli --no-compile
// liquidator needs TRADER_WHITELISTER and liquidator role and some stable coins deposited into vault and eth

const GIVE_USDT = true; // this is for testnet purposes only, on mainnet, liquidators will need to manually deposit on UI or we need to provide a script
const STABLE_COINS_AMOUNT = ethers.utils.parseUnits("500000", 6);
const MINIMUM_ETH_BALANCE = ethers.utils.parseUnits("0.1", 18);
const contracts = constants["arbitrum-goerli"];
const rpcUrl = contracts.RPC_URL;

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const liquidatorAddress = "0xc9132B6Ac716a84CB6705AA27eE05Ed7be7b97D7";
const liquidatorPrivateKey = process.env.LIQUIDATOR_PRIVATE_KEY; // ONLY FOR TESTNET PURPOSES
const liquidator = new ethers.Wallet(liquidatorPrivateKey, provider);

const deployer = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account
const usdGiver = new ethers.Wallet(process.env.USD_GIVER_PRIVATE_KEY, provider);
let tx;
async function setupLiquidator() {

  if (liquidatorPrivateKey !== undefined && liquidatorAddress !== liquidator.address) {
    throw 'liquidator address and liquidator private key do not match';
  }

  const VirtualToken = await ethers.getContractFactory("VirtualToken");
  const virtualToken = await VirtualToken.attach(contracts.USDC);

  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const perpPeriphery = await VolmexPerpPeriphery.attach(contracts.PERIPHERY);

  const Positioning = await ethers.getContractFactory("PositioningTest");
  const positioning = await Positioning.attach(contracts.POSITIONING);

  const isTraderWhitelisted = await perpPeriphery.isTraderWhitelisted(liquidatorAddress);

  if (isTraderWhitelisted) {
    console.log("already whitelisted");
  } else {
    tx = await perpPeriphery.connect(deployer).whitelistTrader(liquidatorAddress, true);
    tx.wait();
    console.log("whitelisted trader", tx.hash);
  }

  const isLiquidator = await positioning.isLiquidatorWhitelisted(liquidatorAddress);

  if (isLiquidator) {
    console.log("already liquidator");
  } else {
    tx = await positioning.connect(deployer).whitelistLiquidator(liquidatorAddress, true);
    tx.wait();
    console.log("whitelisted liquidator", tx.hash);
  }

  if (GIVE_USDT) {
    const liquidatorEthBalance = await provider.getBalance(liquidatorAddress);
    if (liquidatorEthBalance.gte(MINIMUM_ETH_BALANCE)) {
      console.log("ETH balance:", ethers.utils.formatEther(liquidatorEthBalance.toString()));
    } else {
      tx = await deployer.sendTransaction({
        to: liquidatorAddress,
        value: MINIMUM_ETH_BALANCE.sub(liquidatorEthBalance),
      });
      tx.wait();
      console.log("sent eth", tx.hash);
    }


    // nice to have: check if liquidator already has a balance so can skip these steps below
    // convert to 18 decimals
    //transfer
    tx = await virtualToken.connect(usdGiver).transfer(liquidatorAddress, STABLE_COINS_AMOUNT);
    tx.wait();
    console.log("sent stable coins", tx.hash)
    //approve
    // TODO handle edge case of USDT incorrectly approved previously (need to revoke approval first)
    tx = await virtualToken
    .connect(liquidator)
    .approve(contracts.PERIPHERY, STABLE_COINS_AMOUNT);
    tx.wait();
    console.log("approve stable coins to periphery", tx.hash)
    //depositToVault
    tx = await perpPeriphery
    .connect(liquidator)
      .depositToVault(0, contracts.USDC, STABLE_COINS_AMOUNT);
    tx.wait();
    console.log("deposited stable coins", tx.hash);

    console.log('\n')
  }
}

setupLiquidator()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
