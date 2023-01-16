import { ethers, web3 } from "hardhat";

const peripheryAddress = "0x6fB1B380c81e11C3fDf899C1A60Ff2390c496D2C";
const usdcAddress = "0xe6472Bb0242aad1F11eDeA723AAAd076B092edaE";
const BN = ethers.BigNumber;

const deposit = async () => {
  const provider = new ethers.providers.JsonRpcProvider(
    `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
  );
  const account1 = new ethers.Wallet(`${process.env.PRIVATE_KEY_1}`, provider);
  const account2 = new ethers.Wallet(`${process.env.PRIVATE_KEY_2}`, provider);

  const periphery = await ethers.getContractAt("VolmexPerpPeriphery", peripheryAddress);
  const collateral = await ethers.getContractAt("TestERC20", usdcAddress)
  const account1Balance = await collateral.balanceOf(account1.address);
  const account2Balance = await collateral.balanceOf(account2.address);

  // console.log("Approve Periphery ...")
  // await (await collateral.connect(account1).approve(periphery.address, account1Balance)).wait();
  // await (await collateral.connect(account2).approve(periphery.address, account2Balance)).wait();
  // console.log("Approved!!!");

  console.log("Deposit ...");
  await (await periphery.connect(account1).depositToVault(
    0,
    collateral.address,
    BN.from("1000000000000"),
  )).wait();
  await (await periphery.connect(account2).depositToVault(
    0,
    collateral.address,
    BN.from("1000000000000"),
  )).wait();
  console.log("Deposited!!!");
};

deposit()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
