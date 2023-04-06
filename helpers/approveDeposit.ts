import { ethers, web3 } from "hardhat";
const USDCADDR = "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511";
const peripheryAddress = "0xD6a59b034d33d35Dc796411a10E16151655F20c2";
const approveDeposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const USDC = await ethers.getContractFactory("TetherToken");
  const usdc = USDC.attach(USDCADDR);
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);

  const approval = await usdc.approve(peripheryAddress, "100000000000");
  const approvalReceipt = await approval.wait();
  console.log("approval tx hash:", approvalReceipt.transactionHash);

  const deposit = await periphery
    .connect(account1)
    .withdrawFromVault(0, USDCADDR, account1.address, "1000000000");
  const depositReceipt = await deposit.wait();
  console.log("deposit tx hash", depositReceipt.transactionHash);
};
approveDeposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
