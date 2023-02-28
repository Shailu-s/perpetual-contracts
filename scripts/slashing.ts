import { ethers, upgrades, run } from "hardhat";

const slashing = async () => {
  const [owner] = await ethers.getSigners();
  console.log("Deployer: ", await owner.getAddress());
  console.log("Balance: ", (await owner.getBalance()).toString());

  const TestERC20 = await ethers.getContractFactory("TestERC20");
  const Slashing = await ethers.getContractFactory("Slashing");
  const InsuranceFund = await ethers.getContractFactory("InsuranceFund");
  const proxyAdmin = await upgrades.admin.getInstance();

  let usdcAddress = process.env.USDC;
  if (!process.env.USDC) {
    const usdc = await upgrades.deployProxy(TestERC20, ["USD Coin", "USDC", 6], {
      initializer: "__TestERC20_init",
    });
    await usdc.deployed();
    await verifyTask(await proxyAdmin.getProxyImplementation(usdc.address));
    usdcAddress = usdc.address;
    console.log("USDC: ", usdcAddress);
  }
  let insuraceAddress = process.env.INSURANCE_FUND;
  if (!process.env.INSURANCE_FUND) {
    const insurance = await upgrades.deployProxy(InsuranceFund, [usdcAddress]);
    await insurance.deployed();
    await verifyTask(await proxyAdmin.getProxyImplementation(insurance.address));
    insuraceAddress = insurance.address;
    console.log("Insurance: ", insuraceAddress);
  }
  const relayerSafe = process.env.RELAYER_MULTISIG;
  const volmexSafe = process.env.VOLMEX_MULTISIG || await owner.getAddress();
  const slashing = await upgrades.deployProxy(Slashing, [
    usdcAddress,
    relayerSafe,
    volmexSafe,
    volmexSafe,
    300, // 5 days, should be
    insuraceAddress,
  ]);
  await slashing.deployed();
  await verifyTask(await proxyAdmin.getProxyImplementation(slashing.address));
  console.log("Slashing: ", slashing.address);

  await (await slashing.toggleStaking()).wait();
  console.log("DONE !!!")
};

slashing()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });

const verifyTask = async (contract: string) => {
  try {
    await run("verify:verify", {
      address: contract,
    });
  } catch (error) {
    console.log("ERROR - verify");
  }
}