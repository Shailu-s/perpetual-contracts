import { ethers, web3 } from "hardhat";
import { Deployer } from "@matterlabs/hardhat-zksync-deploy";
import { Wallet, utils, ContractFactory } from "zksync-web3";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import hardhat from "hardhat";

const USDCADDR = "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511";
const peripheryAddress = "0xdfA41D11050eD1Dab501e27a44Cb50E435077050";
const oracle = "0x898C9Df84dDAfc64e15c8B92875Ed4FE6ec70515";
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";
const vaultaddress = "0xC1F137Db7be8B606D8D97b926ABa74D8317bc9E9";
const vaultcontrolleraa = "0x9d5Ef0bd892593dc5BC5Ef2226032cEa57C67Ad5";

const approveDeposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);
  // const wallet = new Wallet("ded016e6b77a5847bc4665207ab97157de8749cf96627de82da30734fef5c9aa");
  // const deployer = new Deployer(hardhat, wallet);
  // const wallet1 = new Wallet("0476ef11f262e89813d2bb57a9cc3c067aa8daa4c84bed440110bd8b7188c876");
  // const deployer1 = new Deployer(hardhat, wallet1);
  // const USDCArts = await deployer.loadArtifact("TestERC20");
  // const USDC = new ContractFactory(USDCArts.abi, USDCArts.bytecode, deployer1.zkWallet);
  const USDC = await ethers.getContractFactory("TetherToken");
  // const Vault = await ethers.getContractFactory("Vault");
  // const controller = await ethers.getContractFactory("VaultController");
  // const vault = Vault.attach(vaultaddress);
  // await vault.setSettlementToken("0xB3011837c08D3A447AC1e08CCBAb30caBFC50511");
  const usdc = USDC.attach(USDCADDR);
  // const vaultController = controller.attach(vaultcontrolleraa);
  // await vaultController.registerVault(vaultaddress, "0xB3011837c08D3A447AC1e08CCBAb30caBFC50511");
  // const arts = await deployer.loadArtifact("PerpetualOracle");
  // const Oracle = new ContractFactory(arts.abi, arts.bytecode, deployer.zkWallet);
  // const peripheryarts = await deployer1.loadArtifact("VolmexPerpPeriphery");
  // const Periphery = new ContractFactory(
  //   peripheryarts.abi,
  //   peripheryarts.bytecode,
  //   deployer1.zkWallet,
  // );
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(peripheryAddress);
  // const transfer = await usdc
  //   .connect(account1)
  //   .transfer(account2.address, "100000000000", { gasLimit: 200000000 });
  // const approval = await usdc.connect(account2).approve(peripheryAddress, "100000000000");
  // const approvalReceipt = await approval.wait();
  // console.log("approval tx hash:", approvalReceipt.transactionHash);

  // const deposit = await periphery.connect(account2).depositToVault(0, USDCADDR, "10000000000");
  // const depositReceipt = await deposit.wait();
  // console.log("deposit tx hash", depositReceipt.transactionHash);
  const Oracle = await ethers.getContractFactory("PerpetualOracle");
  const perpOracle = Oracle.attach(oracle);
  // const setter = await perpOracle.setIndexObservationAdder(account1.address);
  for (let i = 0; i < 2; i++) {
    await perpOracle.addIndexObservations([0], [55000000], [proofHash]);
    await perpOracle.addIndexObservations([1], [55000000], [proofHash]);
    console.log(i);
  }
};
approveDeposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
