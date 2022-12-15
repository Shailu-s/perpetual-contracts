const util = require("ethereumjs-util");

async function signPersonalMessage(message, account) {
    var signature = (await web3.eth.sign(message, account)).substr(2, 130);
    var v = util.bufferToInt(new Buffer(signature.substr(128, 2), "hex"));
    return {
        v: v < 27 ? v + 27 : v,
        r: "0x" + signature.substr(0, 64),
        s: "0x" + signature.substr(64, 64),
    };
}

module.exports = { signPersonalMessage };
