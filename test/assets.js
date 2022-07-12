const ethUtil = require('ethereumjs-util');

function id(str) {
  return `0x${ethUtil
    .keccak256(Buffer.from(str))
    .toString('hex')
    .substring(0, 8)}`;
}

function enc(token) {
  return web3.eth.abi.encodeParameter('address', token);
}

const ERC20 = id('ERC20');

module.exports = {
  id,
  ERC20,
  enc,
};
