import { assert, expect } from "chai";
import { ethers, web3 } from "hardhat";
const { signPersonalMessage } = require("../sign")
const util = require('ethereumjs-util');

describe("LibSignature", function () {
    let LibSignature;
    let libSignature;
    let accounts;
    this.beforeAll(async () => {
        accounts = await ethers.getSigners();
        LibSignature = await ethers.getContractFactory("LibSignatureTest")
    });
    this.beforeEach(async () => {
        libSignature = await LibSignature.deploy();
    });

    it("should return correct signer, case: v > 30", async () => {
		const msg = "myMessage";
		const hash = await libSignature.getKeccak(msg)
		const signature = await signPersonalMessage(hash, accounts[1].address);
		const sig2 = signature.r + signature.s.substr(2) + (signature.v + 4).toString(16)
		const signer = await libSignature.recoverFromSigTest(hash, sig2);
		assert.equal(signer, accounts[1].address, "signer");
	});

    it("should return correct signer, default case: v < 30", async () => {
		const msg = "hello world";
		const hash = await libSignature.getKeccak(msg)

		//some random privateKey
		const privateKey = Buffer.from("f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4", "hex")
		
		//getting ethereum address of the given private key
		const realSigner = web3.utils.toChecksumAddress("0x" + util.privateToAddress(privateKey).toString('hex'))
		const signature = util.ecsign(util.toBuffer(hash), privateKey);
		const sig2 = "0x" + signature.r.toString('hex') + signature.s.toString('hex') + signature.v.toString(16)
		const signer = await libSignature.recoverFromSigTest(hash, sig2);
		assert.equal(signer, realSigner, "signer");
	});
});
