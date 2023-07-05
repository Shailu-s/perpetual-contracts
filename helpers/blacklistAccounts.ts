import { ethers, web3 } from "hardhat";

const blacklistAccounts = async () => {
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(`${process.env.PERIPHERY_ADDRESS}`);
  const blackListAddresses = [];
  const iterations = Number((blackListAddresses.length / 100).toFixed(0));
  const isBlacklist = [];
  isBlacklist.fill(true, blackListAddresses.length - 1);
  for (let index = 0; index < iterations; index++) {
    periphery.blacklistAccounts(
      blackListAddresses.slice(100 * index, 100 * (index + 1)),
      isBlacklist.slice(100 * index, 100 * (index + 1)),
    );
  }
};

blacklistAccounts()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
