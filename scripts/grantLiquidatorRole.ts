import { ethers } from "hardhat";
import { BigNumber, Wallet } from "ethers";
// yarn hardhat run scripts/whitelist.ts --network base-goerli --no-compile
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

async function openPosition() {
  const provider = new ethers.providers.JsonRpcProvider(
    "https://icy-fabled-meadow.base-goerli.quiknode.pro/5552ae4af262e5dca077a7a9c26b3cb484599925/",
  );
  const account0 = new ethers.Wallet( // deployer account
    process.env.DEPLOYER_PRIVATE_KEY,
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

  // const TRADER_WHITELISTER_ROLE = ethers.utils.keccak256(
  //   ethers.utils.toUtf8Bytes("TRADER_WHITELISTER"),
  // );

  const Positioning = await ethers.getContractFactory("PositioningTest");
  const positioning = await Positioning.attach(contracts.POSITIONING);

  const traderWhitelister = new Wallet(
    process.env.TRADER_WHITELISTER_PRIVATE_KEY,
    provider,
  );

  const gasLimit = await positioning.estimateGas.whitelistLiquidator(
    traderWhitelister.address,
    true,
  );
  const res1 = await positioning
    .connect(account0)
    .whitelistLiquidator(traderWhitelister.address, true, {
      gasLimit: gasLimit,
      gasPrice: 1800000000,
    });
  const res2 = await res1.wait();
  console.log("res2", res2.transactionHash);

  // const f = await perpPeriphery;

  //   await virtualToken
  //     .connect(account1)
  //     .transfer(testAccount1Address, ethers.utils.parseUnits("1000000", 6));

  //   console.log("USDC balance of account1", abc.toString());
  return;
  const Vault = await ethers.getContractFactory("Vault");
  const VaultController = await ethers.getContractFactory("VaultController");
  const PositioningConfig = await ethers.getContractFactory("PositioningConfig");
  const matchingEngine = await MatchingEngine.attach("0x6E8B0a3f2627F320bD16cbb1a9f55D3E2b2fc5cd");
  const positioningConfig = await PositioningConfig.attach(
    "0x4Cf172aE9F9D6305da2eCA80fDb3f0D4A441aAb1",
  );
  const vault = await Vault.attach("0xD061Fe77fa3011f8b7b00A7d598D091EB73406e7");
  const volmexPerpPeriphery = await VolmexPerpPeriphery.attach(
    "0x1D7DCA5e350881E743AdD8413f3D7F4F74ecfCcF",
  );
  const vaultController = await VaultController.attach(
    "0xaa1d46600a01dCe6712D7b38183D10cC1Bea814B",
  );

  // const abc1 = await matchingEngine.connect(account1).grantMatchOrders(positioning.address, {gasLimit: 2100000});

  // const ab = await positioningConfig.connect(account0).setSettlementTokenBalanceCap(convert("1000000"), {gasLimit: 2100000});

  // const abc = await virtualToken.connect(account1).mint(account1.address, convert("1000"), {gasLimit: 2100000});
  // await virtualToken.connect(account1).mint(account2.address, convert("1000"), {gasLimit: 2100000});
  // const bcvc = await virtualToken.connect(account1).approve(vault.address, convert("1000"), {gasLimit: 2100000});

  // const bcvc2 =await virtualToken.connect(account2).approve(vault.address, convert("1000"), {gasLimit: 2100000});

  // await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"), {gasLimit: 2100000});

  const tx = await vaultController
    .connect(account0)
    .deposit(
      volmexPerpPeriphery.address,
      virtualToken.address,
      account1.address,
      convert("1000"),
      { gasLimit: 2100000 },
    );
  console.log("txq", tx);

  const tx1 = await vaultController
    .connect(account0)
    .deposit(
      volmexPerpPeriphery.address,
      virtualToken.address,
      account2.address,
      convert("1000"),
      { gasLimit: 2100000 },
    );

  console.log("txq", tx1);

  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
}

openPosition()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
