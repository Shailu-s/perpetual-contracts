import { ethers } from "hardhat";
import { BigNumber, Wallet } from "ethers";
import { constants } from "./chains";

// yarn hardhat run scripts/liquidator-getters.ts --network arbitrum-goerli --no-compile

const traderAddress = "0x91162234b156ca3efca290615b4e08dd2e441246";
const contracts = constants["arbitrum-goerli"];
const rpcUrl = contracts.RPC_URL;

const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
const liquidatorAddress = "0xc9132B6Ac716a84CB6705AA27eE05Ed7be7b97D7";
const liquidatorPrivateKey = process.env.LIQUIDATOR_PRIVATE_KEY; // ONLY FOR TESTNET PURPOSES
const liquidator = new ethers.Wallet(liquidatorPrivateKey, provider);

async function main() {
  if (liquidatorPrivateKey !== undefined && liquidatorAddress !== liquidator.address) {
    throw "liquidator address and liquidator private key do not match";
  }

  const VirtualToken = await ethers.getContractFactory("VirtualToken");
  const virtualToken = await VirtualToken.attach(contracts.USDC);

  const PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
  const perpPeriphery = await PerpPeriphery.attach(contracts.PERIPHERY);

  const Positioning = await ethers.getContractFactory("PositioningTest");
  const positioning = await Positioning.attach(contracts.POSITIONING);

  const AccountBalance = await ethers.getContractFactory("AccountBalance");
  const accountBalance = await AccountBalance.attach(contracts.ACCOUNT_BALANCE);

  const VaultController = await ethers.getContractFactory("VaultController");
  const vaultController = await VaultController.attach(contracts.VAULT_CONTROLLER);

  const MatchingEngine = await ethers.getContractFactory("MatchingEngine");
  const matchingEngine = await MatchingEngine.attach(contracts.MATCHING_ENGINE);

  const PositioningConfig = await ethers.getContractFactory("PositioningConfig");
  const positioningConfig = await PositioningConfig.attach(contracts.POSITIONING_CONFIG);

  const mmRatio = await positioningConfig.getMmRatio();

  const baseToken = contracts.BASE_TOKEN;
  const minOrderSize = await positioning.minPositionSizeByBaseToken(baseToken);
  const maxOrderSize = await matchingEngine.getMaxOrderSizeOverTime(baseToken);
  const accountValue = await vaultController.getAccountValue(traderAddress);
  const freeCollateralByRatio = await vaultController.getFreeCollateralByRatio(
    traderAddress,
    mmRatio,
  );

  const isLiquidatable = await accountBalance.isAccountLiquidatable(
    traderAddress,
    baseToken,
    minOrderSize,
    accountValue,
    freeCollateralByRatio,
  );
  const idealAmountToLiquidate = (
    await accountBalance.getLiquidatablePositionSize(traderAddress, baseToken, accountValue)
  ).abs();
  const actualLiquidatableSize = await accountBalance.getNLiquidate(
    idealAmountToLiquidate.abs(),
    minOrderSize,
    maxOrderSize,
  );
  console.log({ traderAddress, actualLiquidatableSize, idealAmountToLiquidate, isLiquidatable });
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
