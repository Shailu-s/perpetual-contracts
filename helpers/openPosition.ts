import { ethers, web3 } from "hardhat";
const BN = ethers.BigNumber;
const ORDER = "0xf555eb98";
const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const baseToken = "0x1925109D259be14A63CA1Ea4C551AFd2bC57E762";
const quoteToken = "0x5450dd06C580E3d17d021408802B52723E04068B";
const positioningAddress = "0xb7AB7435c7Cf10d646C6707386B9439E3b7067e1";
const peripheryAddress = "0xb68C04A6AD25E4A5F5CF97BE582E77CF9795371f";
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

  const Positioning = await ethers.getContractFactory("Positioning");
  const positioning = Positioning.attach(positioningAddress);
  const periphery = Periphery.attach(peripheryAddress);
  console.log(account3.address);
  const li = await positioning
    .connect(account1)
    .liquidate(account3.address, baseToken, "2000000000000000000", { gasLimit: 8000000 });
  const rec = await li.wait();
  // const accountBalance = await ethers.getContractFactory("AccountBalance");
  // const account = accountBalance.attach("0xaa2f68AC0Fd0A67BACd9F4085Ad58910f75905C7");
  // const liquidatableSizes = await account.getLiquidatablePositionSize(
  //   "0x09426b744F04CdcE9AF3E1df5acea60f3d4aAdB5",
  //   "0x1925109D259be14A63CA1Ea4C551AFd2bC57E762",
  //   "56121060000000000000",
  // );
  // console.log(liquidatableSizes.toString(), " size");
  console.log(rec.transactionHash);
  // await periphery.connect(account1).whitelistTrader(account2.address, true);
  // await periphery.connect(account1).whitelistTrader(account3.address, true);

  // const time = new Date().getTime();
  // const deadline = time + 50000000;
  // let salt = time;
  // // // console.log("initial index", indexPrice.toString());
  // // // console.log("initial mark", markPrice.toString());

  // const amounts = {
  //   base: BN.from("10000000000000000000"), // 50
  //   quote: BN.from("500000000000000000000"),
  // };
  // const isShort = false;

  // const orderleft = Order(
  //   ORDER,
  //   deadline.toString(),
  //   account3.address,
  //   isShort ? Asset(baseToken, amounts.base) : Asset(quoteToken, amounts.quote),
  //   isShort ? Asset(quoteToken, amounts.quote) : Asset(baseToken, amounts.base),
  //   salt,
  //   0,
  //   isShort,
  // );
  // const orderRight = Order(
  //   ORDER,
  //   deadline.toString(),
  //   account2.address,
  //   isShort ? Asset(quoteToken, amounts.quote) : Asset(baseToken, amounts.base),
  //   isShort ? Asset(baseToken, amounts.base) : Asset(quoteToken, amounts.quote),
  //   salt++,
  //   0,
  //   !isShort,
  // );
  // const chainId = Number(await web3.eth.getChainId());
  // const domain = {
  //   name: "V_PERP",
  //   version: "1",
  //   chainId: chainId,
  //   verifyingContract: positioningAddress,
  // };
  // const signatureLeft = await account3._signTypedData(domain, Types, orderleft);
  // const signatureRight = await account2._signTypedData(domain, Types, orderRight);
  // console.log("Signature created !!!");

  // // const accountBalance = await ethers.getContractAt(
  // //   "AccountBalance",
  // //   `${process.env.ACCOUNT_BALANCE}`,
  // // );

  // console.log("Opening position ...");
  // const tx = await periphery
  //   .connect(account1)
  //   .openPosition(
  //     0,
  //     orderleft,
  //     signatureLeft,
  //     orderRight,
  //     signatureRight,
  //     encodeAddress(account1.address),
  //   );
  // const receipt = await tx.wait();
  // console.log("Tx Hash: ", receipt.transactionHash);
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
