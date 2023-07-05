import { ethers, web3 } from "hardhat";
import { blacklisedAddresses } from "../utils/blacklistedAddresses";
const blacklistAccounts = async () => {
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(`${process.env.PERIPHERY_ADDRESS}`);
  const iterations = Number((blacklisedAddresses.length / 50).toFixed(0));
  const isBlacklist = new Array(blacklisedAddresses.length).fill(true);
  for (let index = 0; index < iterations; index++) {
    periphery.blacklistAccounts(
      blacklisedAddresses.slice(50 * index, 50 * (index + 1)),
      isBlacklist.slice(50 * index, 50 * (index + 1)),
    );
  }
};

blacklistAccounts()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
