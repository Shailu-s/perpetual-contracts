import { ethers, web3 } from "hardhat";
const ORDER = "0xf555eb98";
const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const deadline = 87654321987654;
const baseToken = "0x2Cd89960d6dDfAbFbB94aecB8413445d7d3a7208";
const quoteToken = "0x3B620b9D1A447190C3d77cd6333d8Cc8229a93c0";
const positioning = "0x930d870A321A740ddA41beD43be034841681eD5c";
const indexPriceOracleAddress = "0x23FE352c550E5b03A6bd3995F99c457eA8649c12";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const peripheryAddress = "0x6fB1B380c81e11C3fDf899C1A60Ff2390c496D2C";
const usdcAddress = "0xe6472Bb0242aad1F11eDeA723AAAd076B092edaE";
const BN = ethers.BigNumber;
function encodeAddress(account) {
  return web3.eth.abi.encodeParameters(["address"], [account]);
}
function Asset(virtualToken, value) {
  return { virtualToken, value };
}
function Order(orderType, deadline, trader, makeAsset, takeAsset, salt, triggerPrice, isShort) {
  return {
    orderType,
    deadline,
    trader,
    makeAsset,
    takeAsset,
    salt,
    triggerPrice,
    isShort,
  };
}
const Types = {
  Asset: [
    { name: "virtualToken", type: "address" },
    { name: "value", type: "uint256" },
  ],
  Order: [
    { name: "orderType", type: "bytes4" },
    { name: "deadline", type: "uint64" },
    { name: "trader", type: "address" },
    { name: "makeAsset", type: "Asset" },
    { name: "takeAsset", type: "Asset" },
    { name: "salt", type: "uint256" },
    { name: "triggerPrice", type: "uint128" },
    { name: "isShort", type: "bool" },
  ],
};
const beforePrice = BN.from("68000000");
const afterPrice = BN.from("400000000");
const deposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
  );
  const owner = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);
  const alice = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const bob = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);
  console.log("Account 1 address: ", alice.address);
  console.log("Account 2 address: ", bob.address);
  const periphery = await ethers.getContractAt("VolmexPerpPeriphery", peripheryAddress);
  const collateral = await ethers.getContractAt("TestERC20", usdcAddress);
  const aliceBalance = await collateral.balanceOf(alice.address);
  const bobBalance = await collateral.balanceOf(bob.address);
  console.log("aliceBalance: ", aliceBalance.toString());
  console.log("bobBalance: ", bobBalance.toString());
  console.log("Approve Periphery ...");
  await (await collateral.connect(alice).approve(periphery.address, aliceBalance)).wait();
  await (await collateral.connect(bob).approve(periphery.address, bobBalance)).wait();
  console.log("Approved!!!");
  console.log("Depositing 1000 collateral from both accounts ...");
  await (
    await periphery.connect(alice).depositToVault(0, collateral.address, "1000000000")
  ).wait();
  console.log("Deposit in Account 1 successful!!!");
  await (await periphery.connect(bob).depositToVault(0, collateral.address, "20000000")).wait();
  console.log("Deposit in Account 2 successful!!!");
  console.log("Deposited!!!");
  const indexPriceOracle = await ethers.getContractAt("IndexPriceOracle", indexPriceOracleAddress);
  console.log("Before index price:");
  console.log((await indexPriceOracle.getIndexTwap(0))[0].toString());
  for (var i = 0; i < 6; i++) {
    await (
      await indexPriceOracle
        .connect(owner)
        .updateBatchVolatilityTokenPrice([0], [beforePrice], [proofHash])
    ).wait();
    console.log("Update ", i + 1);
  }
  console.log("Updated Index price !!!");
  console.log((await indexPriceOracle.getIndexTwap(0))[0].toString());
  console.log("Opening position");
  console.log("Signature creation started ...");
  console.log("account 1: ", alice.address);
  console.log("account 2: ", bob.address);
  const orderLeft = Order(
    ORDER,
    deadline,
    alice.address,
    Asset(baseToken, "25000000000000000000"),
    Asset(quoteToken, "350000000000000000000"),
    472,
    0,
    true,
  );
  const orderRight = Order(
    ORDER,
    deadline,
    bob.address,
    Asset(quoteToken, "350000000000000000000"),
    Asset(baseToken, "25000000000000000000"),
    473,
    0,
    false,
  );
  const chainId = Number(await web3.eth.getChainId());
  const domain = {
    name: "V_PERP",
    version: "1",
    chainId: chainId,
    verifyingContract: positioning,
  };
  const signatureLeft = await alice._signTypedData(domain, Types, orderLeft);
  const signatureRight = await bob._signTypedData(domain, Types, orderRight);
  console.log("Signature created!!!");
  console.log("Opening position ...");
  const tx = await periphery
    .connect(owner)
    .openPosition(
      0,
      orderLeft,
      signatureLeft,
      orderRight,
      signatureRight,
      encodeAddress(owner.address),
    );
  const receipt = await tx.wait();
  console.log("Tx Hash: ", receipt.transactionHash);
  console.log("Update index price ...");
  for (var i = 0; i < 6; i++) {
    await (
      await indexPriceOracle
        .connect(owner)
        .updateBatchVolatilityTokenPrice([0], [afterPrice], [proofHash])
    ).wait();
  }
  console.log("Updated index price !!!");
  console.log((await indexPriceOracle.getIndexTwap(0))[0].toString());
  console.log("Primary", (await indexPriceOracle.getIndexTwap(0))[0].div("1000000").toString());
  console.log("Complement", (await indexPriceOracle.getIndexTwap(0))[1].div("1000000").toString());
};
deposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
