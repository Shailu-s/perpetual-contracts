import { ethers, web3 } from "hardhat";

const indexPriceOracleAddress = "0x23FE352c550E5b03A6bd3995F99c457eA8649c12";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const BN = ethers.BigNumber;
const price = BN.from("10000000");

const indexPrice = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
  );
  const owner = new ethers.Wallet(
    `ded016e6b77a5847bc4665207ab97157de8749cf96627de82da30734fef5c9aa`,
    provider,
  );
  const indexPriceOracle = await ethers.getContractAt("IndexPriceOracle", indexPriceOracleAddress);

  console.log("Update index price ...");
  await (
    await indexPriceOracle
      .connect(owner)
      .updateBatchVolatilityTokenPrice([0], [price], [proofHash])
  ).wait();
  console.log("Updated index price !!!");
  console.log("Primary", (await indexPriceOracle.getIndexSma(0))[0].div("1000000").toString());
  console.log("Complement", (await indexPriceOracle.getIndexSma(0))[1].div("1000000").toString());
};

indexPrice()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
