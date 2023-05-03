import { ethers, web3 } from "hardhat";
const USDCADDR = "0xB4480F3bb50FcE8e2e0A985EF312F8b1123Ef4bD";
const peripheryAddress = "0xe80044cB21403E0F6f223773A1bFc549C59Cd495";
const approveDeposit = async () => {
    const provider = new ethers.providers.JsonRpcProvider("https://arb-goerli.g.alchemy.com/v2/t5XCJjOrFTn8Oq0xofZF62d3uAPutFQU");

    const account1 = new ethers.Wallet(
      "ded016e6b77a5847bc4665207ab97157de8749cf96627de82da30734fef5c9aa",
      provider,
    );
    const account2 = new ethers.Wallet(
      "559089ceab24aeebb54333fc0246d5440499a0f3334a50067fabf9536d5e97ba",
      provider,
    );

  console.log(account2.address)
  const USDC = await ethers.getContractFactory("TetherToken");
  const usdc = USDC.attach(USDCADDR);
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);
  const transfer = await usdc.connect(account1).transfer(account2.address, "100000000000" , { gasLimit: 20000000 });
console.log("===========================================================")
 
  const approval = await usdc.connect(account1).approve(peripheryAddress, "100000000000", { gasLimit: 20000000 });
  const approvalReceipt = await approval.wait();
  console.log("approval tx hash:", approvalReceipt.transactionHash);
console.log("===========================================================")
  const deposit = await periphery
    .connect(account2)
    .depositToVault(0, USDCADDR, "10000000000", { gasLimit: 20000000 });
  const depositReceipt = await deposit.wait();
  console.log("deposit tx hash", depositReceipt.transactionHash);
};
approveDeposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });