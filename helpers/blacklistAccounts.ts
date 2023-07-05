import { ethers, web3 } from "hardhat";
import { blacklistedAddresses } from "../utils/blacklistedAddresses";
const blacklistAccounts = async () => {
  const Periphery = await ethers.getContractFactory("VolmexPerpPeriphery");
  const periphery = Periphery.attach(`${process.env.PERIPHERY_ADDRESS}`);
  const iterations = Number((blacklistedAddresses.length / 50).toFixed(0));
  const isBlacklist = new Array(blacklistedAddresses.length).fill(true);
  for (let index = 0; index < iterations; index++) {
    periphery.blacklistAccounts(
      blacklistedAddresses.slice(200 * index, 200 * (index + 1)),
      isBlacklist.slice(200 * index, 200 * (index + 1)),
    );
  }
};

blacklistAccounts()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });
