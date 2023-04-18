import { assert, expect } from "chai";
import { ethers, web3 } from "hardhat";
const { signPersonalMessage } = require("../sign");
const util = require("ethereumjs-util");

describe("LibSignature", function () {
  let LibSignature;
  let libSignature;
  let accounts;
  this.beforeAll(async () => {
    accounts = await ethers.getSigners();
    LibSignature = await ethers.getContractFactory("LibSignatureTest");
  });
  this.beforeEach(async () => {
    libSignature = await LibSignature.deploy();
  });

  it("should return correct signer, case: v > 30", async () => {
    const msg = "myMessage";
    const hash = await libSignature.getKeccak(msg);
    const signature = await signPersonalMessage(hash, accounts[1].address);
    const sig2 = signature.r + signature.s.substr(2) + (signature.v + 4).toString(16);
    const signer = await libSignature.recoverFromSigTest(hash, sig2);
    assert.equal(signer, accounts[1].address, "signer");
  });
  it("should revert when signature length is not enough", async () => {
    const msg = "myMessage";
    const hash = await libSignature.getKeccak(msg);
    const signature = await signPersonalMessage(hash, accounts[1].address);
    const sig2 =
      signature.r + signature.s.substr(2) + (signature.v + 4).toString(16) + "00000000000000";

    await expect(libSignature.recoverFromSigTest(hash, sig2)).to.be.revertedWith(
      "ECDSA: invalid signature length",
    );
  });
  it("should revert when v value in wrong v > 30", async () => {
    const msg = "hello world";
    const hash = await libSignature.getKeccak(msg);

    //some random privateKey
    const privateKey = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4",
      "hex",
    );

    //getting ethereum address of the given private key
    const realSigner = web3.utils.toChecksumAddress(
      "0x" + util.privateToAddress(privateKey).toString("hex"),
    );
    const signature = util.ecsign(util.toBuffer(hash), privateKey);
    const sig2 =
      "0x" + signature.r.toString("hex") + signature.s.toString("hex") + signature.v.toString(16);
    await expect(
      libSignature.recoverFromParamsTest(
        hash,
        (signature.v + 70).toString(16),
        "0x" + signature.r.toString("hex"),
        "0x" + signature.s.toString("hex"),
      ),
    ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
  });
  it("should revert when s value in wrong ", async () => {
    const msg = "hello world";
    const hash = await libSignature.getKeccak(msg);

    //some random privateKey
    const privateKey = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4",
      "hex",
    );

    //getting ethereum address of the given private key
    const realSigner = web3.utils.toChecksumAddress(
      "0x" + util.privateToAddress(privateKey).toString("hex"),
    );
    const signature = util.ecsign(util.toBuffer(hash), privateKey);
    const sig2 =
      "0x" + signature.r.toString("hex") + signature.s.toString("hex") + signature.v.toString(16);

    await expect(
      libSignature.recoverFromParamsTest(
        hash,
        (signature.v + 7).toString(16),
        "0x" + signature.r.toString("hex"),
        "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141",
      ),
    ).to.be.revertedWith("ECDSA: invalid signature 's' value");
  });
  it("should revert due to valid signature ", async () => {
    const msg = "hello world";
    const hash = await libSignature.getKeccak(msg);

    //some random privateKey
    const privateKey = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4",
      "hex",
    );

    //getting ethereum address of the given private key
    const realSigner = web3.utils.toChecksumAddress(
      "0x" + util.privateToAddress(privateKey).toString("hex"),
    );
    const privateKey1 = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec5",
      "hex",
    );
    const signature1 = util.ecsign(util.toBuffer(hash), privateKey1);
    const signature = util.ecsign(util.toBuffer(hash), privateKey);
    const sig2 =
      "0x" + signature.r.toString("hex") + signature.s.toString("hex") + signature.v.toString(16);
    let s = "0x" + signature1.s.toString("hex");

    await expect(
      libSignature.recoverFromParamsTest(
        hash,
        (signature.v + 4).toString(16),
        "0x" + signature.r.toString("hex"),
        s,
      ),
    ).to.be.revertedWith("ECDSA: invalid signature");
  });
  it("should revert invalid v value when v < 27 ", async () => {
    const msg = "hello world";
    const hash = await libSignature.getKeccak(msg);

    //some random privateKey
    const privateKey = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4",
      "hex",
    );

    //getting ethereum address of the given private key
    const realSigner = web3.utils.toChecksumAddress(
      "0x" + util.privateToAddress(privateKey).toString("hex"),
    );

    const signature = util.ecsign(util.toBuffer(hash), privateKey);
    const sig2 =
      "0x" + signature.r.toString("hex") + signature.s.toString("hex") + signature.v.toString(16);
    let s = "0x" + signature.s.toString("hex");

    await expect(
      libSignature.recoverFromParamsTest(
        hash,
        (signature.v - 4).toString(16),
        "0x" + signature.r.toString("hex"),
        s,
      ),
    ).to.be.revertedWith("ECDSA: invalid signature 'v' value");
  });

  it("should return correct signer, default case: v < 30", async () => {
    const msg = "hello world";
    const hash = await libSignature.getKeccak(msg);

    //some random privateKey
    const privateKey = Buffer.from(
      "f1a884c5c58e8770b294e7db47eadc8ac5c5466211aa109515268c881c921ec4",
      "hex",
    );

    //getting ethereum address of the given private key
    const realSigner = web3.utils.toChecksumAddress(
      "0x" + util.privateToAddress(privateKey).toString("hex"),
    );
    const signature = util.ecsign(util.toBuffer(hash), privateKey);
    const sig2 =
      "0x" + signature.r.toString("hex") + signature.s.toString("hex") + signature.v.toString(16);
    const signer = await libSignature.recoverFromSigTest(hash, sig2);
    assert.equal(signer, realSigner, "signer");
  });
});
