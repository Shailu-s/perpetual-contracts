import { ethers } from "hardhat";
import { BigNumber } from "ethers";

async function openPosition() {


  const provider = new ethers.providers.JsonRpcProvider("https://arb-goerli.g.alchemy.com/v2/t5XCJjOrFTn8Oq0xofZF62d3uAPutFQU");
  const account0 = new ethers.Wallet(
    "ef711220436ed2a960d623caceb30e82c2e9ee4be453c76f3181fa7504ba1efc",
    provider,
  );
  const account1 = new ethers.Wallet(
    "ded016e6b77a5847bc4665207ab97157de8749cf96627de82da30734fef5c9aa",
    provider,
  );
  const account2 = new ethers.Wallet(
    "b2eada77569027933f70e63fbb356a1193bcb3c3d52cba3859d5fd73103d69c8",
    provider,
  );


    const VolmexPerpPeriphery = await ethers.getContractFactory("VolmexPerpPeriphery");
    // fundingRate = await smock.fake("FundingRate")
    const MatchingEngine = await ethers.getContractFactory("MatchingEngineTest");
    const VirtualToken = await ethers.getContractFactory("VirtualToken");
    const Positioning = await ethers.getContractFactory("PositioningTest");
    const Vault = await ethers.getContractFactory("Vault");
    const VaultController = await ethers.getContractFactory("VaultController");
    const PositioningConfig = await ethers.getContractFactory("PositioningConfig");
const matchingEngine = await MatchingEngine.attach("0x6E8B0a3f2627F320bD16cbb1a9f55D3E2b2fc5cd")
const positioning = await Positioning.attach("0x2323E508681aD31b13C035c3e08C99AF2869A710")
const virtualToken = await VirtualToken.attach("0x243FFc5F0c23D64Be9B0Bb33F7fcaF4BC5dD5A26")
const positioningConfig = await PositioningConfig.attach("0x4Cf172aE9F9D6305da2eCA80fDb3f0D4A441aAb1")
const vault = await Vault.attach("0xD061Fe77fa3011f8b7b00A7d598D091EB73406e7")
const volmexPerpPeriphery = await VolmexPerpPeriphery.attach("0x1D7DCA5e350881E743AdD8413f3D7F4F74ecfCcF")
const vaultController = await VaultController.attach("0xaa1d46600a01dCe6712D7b38183D10cC1Bea814B")

// const abc1 = await matchingEngine.connect(account1).grantMatchOrders(positioning.address, {gasLimit: 2100000});

// const ab = await positioningConfig.connect(account0).setSettlementTokenBalanceCap(convert("1000000"), {gasLimit: 2100000});

// const abc = await virtualToken.connect(account1).mint(account1.address, convert("1000"), {gasLimit: 2100000});
// await virtualToken.connect(account1).mint(account2.address, convert("1000"), {gasLimit: 2100000});
// const bcvc = await virtualToken.connect(account1).approve(vault.address, convert("1000"), {gasLimit: 2100000});

// const bcvc2 =await virtualToken.connect(account2).approve(vault.address, convert("1000"), {gasLimit: 2100000});

// await virtualToken.connect(account1).approve(volmexPerpPeriphery.address, convert("1000"), {gasLimit: 2100000});

const tx = await vaultController
  .connect(account0)
  .deposit(
    volmexPerpPeriphery.address,
    virtualToken.address,
    account1.address,
    convert("1000"), {gasLimit: 2100000}
  );
console.log("txq", tx)

const tx1 = await vaultController
  .connect(account0)
  .deposit(
    volmexPerpPeriphery.address,
    virtualToken.address,
    account2.address,
    convert("1000"), {gasLimit: 2100000}
  );


console.log("txq", tx1)


  function convert(num) {
    const one = BigNumber.from(ethers.constants.WeiPerEther.toString()); // 1e18 in string
    return BigNumber.from(num).mul(one).toString();
  }
};


openPosition()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Error: ", error);
    process.exit(1);
  });