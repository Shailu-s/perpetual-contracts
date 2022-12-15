const EIP712 = require("./EIP712");

function Asset(virtualToken, value) {
    return { virtualToken, value };
}

function LimitOrder(orderType, trader, deadline, isShort, makeAsset, takeAsset, salt, triggerPrice) {
    return {
        orderType,
        trader,
        deadline,
        isShort,
        makeAsset,
        takeAsset,
        salt,
        triggerPrice,
    };
}

const Types = {
    Asset: [
        { name: "virtualToken", type: "address" },
        { name: "value", type: "uint256" },
    ],
    LimitOrder: [
        { name: "orderType", type: "bytes4" },
        { name: "trader", type: "address" },
        { name: "deadline", type: "uint64" },
        { name: "isShort", type: "bool" },
        { name: "makeAsset", type: "Asset" },
        { name: "takeAsset", type: "Asset" },
        { name: "salt", type: "uint256" },
        { name: "triggerPrice", type: "uint256" },
    ],
};

async function sign(order, account, verifyingContract) {
    const chainId = Number(await web3.eth.getChainId());
    const data = EIP712.createTypeData(
        {
            name: "V_PERP",
            version: "1",
            chainId,
            verifyingContract,
        },
        "LimitOrder",
        order,
        Types,
    );
    return (await EIP712.signTypedData(web3, account, data)).sig;
}

module.exports = { Asset, LimitOrder, sign };
