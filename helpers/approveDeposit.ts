import { ethers, web3 } from "hardhat";
const USDCADDR = "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511";
const peripheryAddress = "0x3D75bBa814a5F32CfE0d728C560845F08A41C76c";
const oracle = "0x26AC26788bd7fdEd6B1AB70629214C2Aa211d8c9";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

const approveDeposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://soft-ancient-owl.base-goerli.discover.quiknode.pro/8fe248d5da37b5ea28fbb48d7d94651386abe2a6/`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const USDC = await ethers.getContractFactory("TetherToken");
  const usdc = USDC.attach(USDCADDR);
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);
  const transfer = await usdc.connect(account1).transfer(account2.address, "100000000000");
  const approval = await usdc.connect(account2).approve(peripheryAddress, "100000000000");
  const approvalReceipt = await approval.wait();
  console.log("approval tx hash:", approvalReceipt.transactionHash);

  const deposit = await periphery.connect(account2).depositToVault(0, USDCADDR, "100000000000");
  const depositReceipt = await deposit.wait();
  console.log("deposit tx hash", depositReceipt.transactionHash);
  // const Oracle = await ethers.getContractFactory("PerpetualOracle");
  // const perpOracle = Oracle.attach(oracle);
  // // const setter = await perpOracle.setIndexObservationAdder(account1.address);
  // for (let i = 0; i < 1; i++) {
  //   await perpOracle.connect(account1).addIndexObservations([0], [50000000], [proofHash]);
  //   // await perpOracle.addIndexObservations([1], [50000000], [proofHash]);
  //   console.log(i);
  // }
};
approveDeposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
