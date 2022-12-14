import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-web3"
import "@openzeppelin/hardhat-upgrades"
import "@typechain/hardhat"
import "hardhat-contract-sizer"
import "hardhat-dependency-compiler"
import "hardhat-gas-reporter"
import "@openzeppelin/hardhat-defender"
import "@nomiclabs/hardhat-etherscan"
import { HardhatUserConfig } from "hardhat/config"
import "solidity-coverage"
import "./mocha-test"

import { config as dotEnvConfig } from "dotenv"
dotEnvConfig()

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.12",
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
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
    },
    goerli: {
      url: `https://eth-goerli.g.alchemy.com/v2/${process.env.GOERLI_ALCHEMY_API_KEY}`,
      accounts: [`0x${process.env.PRIVATE_KEY}`],
      throwOnTransactionFailures: true,
      loggingEnabled: true,
      gasMultiplier: 1.5,
      timeout: 18000000
    },
    mumbai: {
        url: `https://polygon-mumbai.g.alchemy.com/v2/${process.env.POLYGON_TESTNET_ALCHEMY_API_KEY}`,
        accounts: [`0x${process.env.PRIVATE_KEY}`],
        throwOnTransactionFailures: true,
        loggingEnabled: true,
        gas: 5000000,
        gasPrice: 10000000000,
        blockGasLimit: 8000000,
      }
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
  mocha: {
    require: ["ts-node/register/files"],
    jobs: 4,
    timeout: 120000,
    color: true,
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  defender: {
    apiKey: process.env.DEFENDER_TEAM_API_KEY,
    apiSecret: process.env.DEFENDER_TEAM_API_SECRET_KEY,
  }
}

export default config
