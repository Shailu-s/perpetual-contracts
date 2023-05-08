import { ethers, web3 } from "hardhat";
const BN = ethers.BigNumber;
const ORDER = "0xf555eb98";
const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const baseToken = "0xcadEe957FCf2Cf7a98D3603849e5DD1a3f8b9161";
const quoteToken = "0x9BBe422bA2c07E5Eab4D164d4e0a0922642F3fF8";
const positioningAddress = "0xdb493c4e935CAE3C52E7c388bCD4BaD12D2575eB";
const peripheryAddress = "0x9Ea25BF544e70aaA6e19C9fFcf59ef0c89cFDFbb";
function encodeAddress(account) {
  return web3.eth.abi.encodeParameters(["address"], [account]);
}
function Asset(virtualToken, value) {
  return { virtualToken, value };
}
function Order(
  orderType,
  deadline,
  trader,
  makeAsset,
  takeAsset,
  salt,
  limitOrderTriggerPrice,
  isShort,
) {
  return {
    orderType,
    deadline,
    trader,
    makeAsset,
    takeAsset,
    salt,
    limitOrderTriggerPrice,
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
    { name: "limitOrderTriggerPrice", type: "uint128" },
    { name: "isShort", type: "bool" },
  ],
};
async function getSignature() {
  console.log("Signature creation started ...");
  const provider = new ethers.providers.JsonRpcProvider(
    `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const account3 = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");

  const positioning = await ethers.getContractAt("Positioning", positioningAddress);
  const periphery = Periphery.attach(peripheryAddress);
  await periphery.whitelistTrader(account2.address, true);
  await periphery.whitelistTrader(account3.address, true);

  const time = new Date().getTime();
  const deadline = time + 50000000;
  let salt = time;
  // console.log("initial index", indexPrice.toString());
  // console.log("initial mark", markPrice.toString());

  const amounts = {
    base: BN.from("10000000000000000000"), // 50
    quote: BN.from("980000000000000000000"),
  };
  const isShort = false;

  const orderleft = Order(
    ORDER,
    deadline.toString(),
    account3.address,
    isShort ? Asset(baseToken, amounts.base) : Asset(quoteToken, amounts.quote),
    isShort ? Asset(quoteToken, amounts.quote) : Asset(baseToken, amounts.base),
    salt,
    0,
    isShort,
  );
  const orderRight = Order(
    ORDER,
    deadline.toString(),
    account2.address,
    isShort ? Asset(quoteToken, amounts.quote) : Asset(baseToken, amounts.base),
    isShort ? Asset(baseToken, amounts.base) : Asset(quoteToken, amounts.quote),
    salt++,
    0,
    !isShort,
  );
  const chainId = Number(await web3.eth.getChainId());
  const domain = {
    name: "V_PERP",
    version: "1",
    chainId: chainId,
    verifyingContract: positioningAddress,
  };
  const signatureLeft = await account3._signTypedData(domain, Types, orderleft);
  const signatureRight = await account2._signTypedData(domain, Types, orderRight);
  console.log("Signature created !!!");

  // const accountBalance = await ethers.getContractAt(
  //   "AccountBalance",
  //   `${process.env.ACCOUNT_BALANCE}`,
  // );

  console.log("Opening position ...");
  const tx = await periphery
    .connect(account1)
    .openPosition(
      0,
      orderleft,
      signatureLeft,
      orderRight,
      signatureRight,
      encodeAddress(account1.address),
    );
  const receipt = await tx.wait();
  console.log("Tx Hash: ", receipt.transactionHash);
  // console.log("final", (await markPriceOracle.getLastSma("14400", 0)).toString());

  // const requiredData = {
  //   owedUnRealizedPnl: (await accountBalance.getPnlAndPendingFee(account3.address)).toString(),
  //   pendingFundingPayment: (
  //     await positioning.getPendingFundingPayment(account3.address, baseToken)
  //   ).toString(),
  //   positionSize: (await accountBalance.getPositionSize(account3.address, baseToken)).toString(),
  // };
  // console.log("response: ", requiredData);
}

getSignature()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
