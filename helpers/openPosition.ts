import { ethers, web3 } from "hardhat";
const BN = ethers.BigNumber;
const ORDER = "0xf555eb98";
const STOP_LOSS_LIMIT_ORDER = "0xeeaed735";
const TAKE_PROFIT_LIMIT_ORDER = "0xe0fc7f94";
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
const deadline = 87654321987654;
const baseToken = "0x2Cd89960d6dDfAbFbB94aecB8413445d7d3a7208";
const quoteToken = "0x3B620b9D1A447190C3d77cd6333d8Cc8229a93c0";
const positioning = "0x930d870A321A740ddA41beD43be034841681eD5c";
const peripheryAddress = "0x6fB1B380c81e11C3fDf899C1A60Ff2390c496D2C";
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
async function getSignature() {
  console.log("Signature creation started ...");
  const provider = new ethers.providers.JsonRpcProvider(
    `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);
  const account3 = new ethers.Wallet(`c04483a790a7a12c503982fa6a587ff8b755dba64e74b7435a8470db266c7afc`, provider);
  const orderleft = Order(
    ORDER,
    deadline,
    account3.address,
    Asset(baseToken, BN.from("9000000000000000000")),
    Asset(quoteToken, BN.from("9000000000000000000")),
    145,
    0,
    true,
  );
  const orderRight = Order(
    ORDER,
    deadline,
    account2.address,
    Asset(quoteToken, BN.from("9000000000000000000")),
    Asset(baseToken, BN.from("9000000000000000000")),
    146,
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
  const signatureLeft = await account3._signTypedData(domain, Types, orderleft);
  const signatureRight = await account2._signTypedData(domain, Types, orderRight);
  console.log("Signature created !!!");

  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);
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
}

getSignature()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
