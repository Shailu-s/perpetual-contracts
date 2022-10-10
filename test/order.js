const EIP712 = require("./EIP712")

function Asset(virtualToken, value) {
  return { virtualToken, value }
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
    isShort
  }
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
}

async function sign(order, account, verifyingContract) {
  const chainId = Number(await web3.eth.getChainId());
  const data = EIP712.createTypeData(
    {
      name: "V_PERP",
      version: "1",
      chainId,
      verifyingContract,
    },
    "Order",
    order,
    Types,
  )
  return (await EIP712.signTypedData(web3, account, data)).sig
}

module.exports = { Asset, Order, sign }
