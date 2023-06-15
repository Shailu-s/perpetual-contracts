import { ethers } from "hardhat";
import { BigNumber } from "ethers";
// yarn hardhat run scripts/whitelist.ts --network base-goerli

import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

const contracts = {
  PERPETUAL_ORACLE: "0x26AC26788bd7fdEd6B1AB70629214C2Aa211d8c9",
  BASE_TOKEN: "0x6153C83845fcd2E406a4732de30fC06b1031FaC7",
  BASE_TOKEN_2: "0xDF3A92A7B883B482651388eC5b71370A3A038Db3",
  USDC: "0xF398bDAF7044Bb745188B4E8827D57c602C4D9e4",
  USDT: "0xF398bDAF7044Bb745188B4E8827D57c602C4D9e4",
  MATCHING_ENGINE: "0x08c37AC1a265e156f4f88C0f06eBfc258D134B47",
  POSITIONING_CONFIG: "0x49dE9C3E84afC77e69438B43F9721F3c9D6bBAc2",
  ACCOUNT_BALANCE: "0x9b8d2191963c992e4F8F900fa1cC60ce5366161B",
  VAULT: "0xb8949d29964591792a05F2906aeBdEAA1a912612",
  VAULT_CONTROLLER: "0xeA4aBD487aB013C95F2530922aeA007324b83240",
  POSITIONING: "0xD83d5bfF0B20D7eB34125B86879Cbd2Fc047a741",
  PERIPHERY: "0x4C333EE98201D1062E9f7c2404a6c48fD7B67D87",
  MARKET_REGISTRY: "0x9DD0f5797fDf18B534a7Ac85fE2f3cd8E0d2E688",
  QUOTE_TOKEN: "0xfe0B36Cee1B08D160b5031A3b397b61A261DC333",
  Perp_View: "0x4b9B35648Cd2A70f530683C712fCc40d245e860B",
  PERP_FACTORY: "0xf2726eaD68ab70b13Bf79303017e29581cafE5c3",
};

async function main() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://icy-fabled-meadow.base-goerli.quiknode.pro/5552ae4af262e5dca077a7a9c26b3cb484599925/",
  );
  const account0 = new ethers.Wallet( // deployer account
    process.env.DEPLOYER_PRIVATE_KEY,
    provider,
  );

  const traderWhitelister = new ethers.Wallet(
    process.env.TRADER_WHITELISTER_PRIVATE_KEY,
    provider,
  );

  //   const account2 = new ethers.Wallet(
  //     "b2eada77569027933f70e63fbb356a1193bcb3c3d52cba3859d5fd73103d69c8",
  //     provider,
  //   );

  const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
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
