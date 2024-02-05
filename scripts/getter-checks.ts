import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { config as dotEnvConfig } from "dotenv";
import { constants } from "./chains";
dotEnvConfig();
// yarn hardhat run scripts/getter-checks.ts --network base-goerli --no-compile

const contracts = constants["base-goerli-staging"];
const rpcUrl = contracts.RPC_URL;
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

async function checks() {
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const account0 = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account

  const PerpPeriphery = await ethers.getContractFactory("PerpPeriphery");
  // fundingRate = await smock.fake("FundingRate")
  const MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
  const VirtualToken = await ethers.getContractFactory("VirtualToken");
  const Positioning = await ethers.getContractFactory("PositioningTest");
  const Vault = await ethers.getContractFactory("Vault");
  const VaultController = await ethers.getContractFactory("VaultController");
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig");

  const matchingEngine = await MatchingEngine.attach(contracts.MATCHING_ENGINE);
  const positioning = await Positioning.attach(contracts.POSITIONING);
  const virtualToken = await VirtualToken.attach(contracts.USDC);
  const positioningConfig = await PositioningConfig.attach(contracts.POSITIONING_CONFIG);
  const vault = await Vault.attach(contracts.VAULT);
  const PerpPeriphery = await PerpPeriphery.attach(contracts.PERIPHERY);
  const vaultController = await VaultController.attach(contracts.VAULT_CONTROLLER);

  const order = {
    "orderType": "0xf555eb98",
    "deadline": "1689021222624",
    "trader": "0x91162234B156ca3EfCa290615B4E08Dd2e441246",
    "makeAsset": {
        "virtualToken": "0x175D939637f9D3Eb4421EF3a1442bE9Fd70Ac9fB",
        "value": "10640561821664183868"
    },
    "takeAsset": {
        "virtualToken": "0xeD1f0bf19b7c08297e1a74daeB3922940f16D226",
        "value": "500000000000000000000"
    },
    "salt": "1688971222522000",
    "limitOrderTriggerPrice": "0",
    "isShort": true
}

  const res = await positioning.getOrderValidate(order);
  console.log(res);
}

checks();
