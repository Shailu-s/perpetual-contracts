import { ethers } from "hardhat";
import { BigNumber } from "ethers";
// yarn hardhat run scripts/oracle-add-observation.ts --network arbitrum-goerli

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

const contracts = {
  PERPETUAL_ORACLE: "0x424EE289F0Fb5c22DcB842f98e9FeCEF8bB34cFa",
  BASE_TOKEN: "0x0218fB8A664d0E15A34cBfa5E606ae5ED66cFb37",
  BASE_TOKEN_2: "0xDd1A614AD591d7A17953Bb4314c630ae2865D5B7",
  USDC: "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511",
  USDT: "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511",
  MATCHING_ENGINE: "0x78e88Ecbd262439ea27B5D5c480f74f576E123C7",
  POSITIONING_CONFIG: "0x2EF3c3CbF567bb90129B8799A378d56Afc8bA8E4",
  ACCOUNT_BALANCE: "0x38350A699760F29360f47580B9158c87f8F43d67",
  VAULT: "0x8b2789C0C6163b120E6A3949FB528cBbBAA6879A",
  VAULT_CONTROLLER: "0x3a8672BC3FFC98A2b889f3B1B6c0dAc446b3ef85",
  POSITIONING: "0x2B1A5168fC68a6ebd7ff00Be9d9764E00C021AEe",
  PERIPHERY: "0x4c7789A5E943d6Be38E60d2d96F2E47bf491574a",
  MARKET_REGISTRY: "0xD30F628D389a1522606a430BDfEA7Ea30E5b947D",
  QUOTE_TOKEN: "0x78F103d2AF2594E178D22A46EF55d8ccc5c6a159",
  Perp_View: "0xdb99900320EAE281630F04ad29637AF2501f026d",
  PERP_FACTORY: "0x74bC67ed6948f0a4C387C353975F142Dc640537a",
};
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://arb-goerli.g.alchemy.com/v2/ZxuFZJ2-g6_2A-zWXYTU5UegMBIZHqDb",
  );
  const account0 = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account


  //   const account2 = new ethers.Wallet(
  //     "b2eada77569027933f70e63fbb356a1193bcb3c3d52cba3859d5fd73103d69c8",
  //     provider,
  //   );

  const PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
  const perpetualOracle = await PerpetualOracle.attach(contracts.PERPETUAL_ORACLE).connect(account0);

  const res = await perpetualOracle.addIndexObservations([0,1], [ethers.utils.parseUnits("1", 6), ethers.utils.parseUnits("1", 6)], [proofHash,proofHash]);
  console.log("res", res);
  
  await res.wait()
  console.log("res123", res);
    return;

  const VolmexOracle = await ethers.getContractFactory("VolmexPerpPeriphery");
  // fundingRate = await smock.fake("FundingRate")
  //   const MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
  const VirtualToken = await ethers.getContractFactory("VirtualToken");

  const perpPeriphery = await VolmexPerpPeriphery.attach(contracts.PERIPHERY);
  const virtualToken = await VirtualToken.attach(contracts.USDC);
  //   const abc = await virtualToken.connect(account1).balanceOf(account1.address);

  const testAccount1Address = "0x085FF9Cdf1b506135B850B61488d86A0c251657c";
  const testAccount2Address = "0xCcd0c0603fe4A9337C9363d994908b62F08Fdc8c";
  const aditya1Address = "0x401f0B1c51A7048D3dB9A8ca4E9a370e563E0Fb9";
  const aditya2Address = "0x7c610B4dDA11820b749AeA40Df8cBfdA1925e581";
  //   const f = await perpPeriphery
  //   .connect(account0)
  //   .whitelistTrader(aditya1Address, true, { gasLimit: 20000000, gasPrice: 1600000000 });
  //   const res = await perpPeriphery
  //     .connect(account0)
  //     .whitelistTrader(aditya1Address, true, { gasLimit: 20000000, gasPrice: 1600000000 });

  const gasLimit = await perpPeriphery
    .connect(traderWhitelister)
    .estimateGas.whitelistTrader(testAccount1Address, true);
  //   return;
  const res1 = await perpPeriphery
    .connect(traderWhitelister)
    .whitelistTrader(testAccount1Address, true, { gasLimit: gasLimit, gasPrice: 2000000000 });
  const f = await res1.wait();
  console.log("f", f.transactionHash);

  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
