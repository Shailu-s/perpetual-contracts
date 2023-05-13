import { ethers, web3 } from "hardhat";
const USDCADDR = "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511";
const peripheryAddress = "0x9Ea25BF544e70aaA6e19C9fFcf59ef0c89cFDFbb";
const oracle = "0x5036D4ac1B26c8c59e0186570AE37d39DBe3cF3d";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

const approveDeposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);
  const USDC = await ethers.getContractFactory("TetherToken");
  const usdc = USDC.attach(USDCADDR);
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);
  const transfer = await usdc
    .connect(account1)
    .transfer(account2.address, "100000000000", { gasLimit: 200000000 });
  const approval = await usdc
    .connect(account2)
    .approve(peripheryAddress, "100000000000", { gasLimit: 200000000 });
  const approvalReceipt = await approval.wait();
  console.log("approval tx hash:", approvalReceipt.transactionHash);

  const deposit = await periphery.connect(account2).depositToVault(0, USDCADDR, "10000000000");
  const depositReceipt = await deposit.wait();
  console.log("deposit tx hash", depositReceipt.transactionHash);
  // const Oracle = await ethers.getContractFactory("PerpetualOracle");
  // const perpOracle = Oracle.attach(oracle);
  // const setter = await perpOracle.setIndexObservationAdder(account1.address);
  // for (let i = 0; i < 10; i++) {
  //   await perpOracle.addIndexObservations([0], [68000000], [proofHash]);
  // }
};
approveDeposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
