import { ethers } from "hardhat";
import { BigNumber } from "ethers";
// yarn hardhat run scripts/oracle-add-observation.ts --network arbitrum-goerli --no-compile

import { config as dotEnvConfig } from "dotenv";
import { constants } from "./chains";
dotEnvConfig();

const contracts = constants["base-goerli-staging"];
const rpcUrl = contracts.RPC_URL;
const proofHash = "0x6c00000000000000000000000000000000000000000000000000000000000000";

async function main() {
  console.log('main() called')
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const account0 = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider); // deployer account

  //   const account2 = new ethers.Wallet(
  //     "b2eada77569027933f70e63fbb356a1193bcb3c3d52cba3859d5fd73103d69c8",
  //     provider,
  //   );

  const PerpetualOracle = await ethers.getContractFactory("PerpetualOracle");
  const perpetualOracle = await PerpetualOracle.attach(contracts.PERPETUAL_ORACLE).connect(
    account0,
  );

  const res = await perpetualOracle.addIndexObservations(
    [0, 1],
    [ethers.utils.parseUnits("47", 6), ethers.utils.parseUnits("47", 6)],
    [proofHash, proofHash], {
      gasPrice: ethers.utils.parseUnits("20", "gwei"),
    }
  );
  await res.wait();
  console.log("res123", res);
}
main()
setInterval(main, 1000 * 30 * 60)
// // main()
// //   .then(() => process.exit(0))
// //   .catch(error => {
// //     console.error("Error: ", error);
// //     process.exit(1);
// //   });
