const EIP712 = require("./EIP712")

function Asset(virtualToken, value) {
  return { virtualToken, value }
}

function Order(trader, deadline, isShort, isMaker, makeAsset, takeAsset, salt) {
  return {
    trader,
    deadline,
    isShort,
    isMaker,
    makeAsset,
    takeAsset,
    salt
  }
}

const Types = {
  Asset: [
    { name: "virtualToken", type: "address" },
    { name: "value", type: "uint256" },
  ],
  Order: [
    { name: "trader", type: "address" },
    { name: "deadline", type: "uint256" },
    { name: "isShort", type: "bool" },
    { name: "isMaker", type: "bool" },
    { name: "makeAsset", type: "Asset" },
    { name: "takeAsset", type: "Asset" },
    { name: "salt", type: "uint256" },
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
