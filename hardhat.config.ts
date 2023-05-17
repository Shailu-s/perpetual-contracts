import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@nomicfoundation/hardhat-network-helpers";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "hardhat-contract-sizer";
import "hardhat-dependency-compiler";
import "hardhat-gas-reporter";
import "@openzeppelin/hardhat-defender";
import "@nomiclabs/hardhat-etherscan";
import { HardhatUserConfig } from "hardhat/config";
import "solidity-coverage";
import "hardhat-docgen";
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.18",
        settings: {
          optimizer: { enabled: true, runs: 100 },
          evmVersion: "berlin",
          // for smock to mock contracts
          outputSelection: {
            "*": {
              "*": ["storageLayout"],
            },
          },
        },
      },
      {
        version: "0.5.1",
      },
    ],
  },
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      forking: {
        url: `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
        blockNumber: 19456140
      }
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.GOERLI_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gasMultiplier: 1.5,
      timeout: 36000000,
    },
    mumbai: {
      url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gasMultiplier: 1.5,
      timeout: 36000000,
    },
    zkEvm: {
      url: `https://rpc.public.zkevm-test.net/`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      // gasMultiplier: 1.5,
      timeout: 36000000,
    },
    "arbitrum-goerli": {
      url: `https://arb-goerli.g.alchemy.com/v2/${process.env.ARBITRUM_TESTNET_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gasMultiplier: 1,
      timeout: 36000000,
    },
  },
  contractSizer: {
    alphaSort: true,
    runOnCompile: true,
    disambiguatePaths: false,
  },
  gasReporter: {
    excludeContracts: ["test"],
    enabled: true,
    currency: "USD",
    gasPrice: 21,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  defender: {
    apiKey: process.env.DEFENDER_TEAM_API_KEY,
    apiSecret: process.env.DEFENDER_TEAM_API_SECRET_KEY,
  },
  docgen: {
    path: "./docs",
    clear: true,
    runOnCompile: true,
  },
};

export default config;
