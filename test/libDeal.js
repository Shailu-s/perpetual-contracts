function DealSide(asset, proxy, from) {
  return {
    asset,
    proxy,
    from
  };
}

function DealData(protocolFee, maxFeesBasePoint, feeSide) {
  return { 
    protocolFee,
    maxFeesBasePoint,
    feeSide
  }
}

const Types = {
  DealSide: [
    { name: "asset", type: "Asset" },
    { name: "proxy", type: "address" },
    { name: "from", type: "address" },
  ],
  DealData: [
    { name: "protocolFee", type: "uint256" },
    { name: "maxFeeBasePoint", type: "uint256" },
    { name: "feeSide", type: "enum" },
  ],
}

module.exports = { DealSide, DealData }
