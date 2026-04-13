import "dotenv/config";
import "@fhevm/hardhat-plugin";
import { HardhatUserConfig } from "hardhat/config";

const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const RPC_URL = process.env.RPC_URL || "";
const networks: HardhatUserConfig["networks"] = {
  hardhat: {},
};

if (RPC_URL) {
  networks.zamaTestnet = {
    url: RPC_URL,
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
  };
}

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks,
};

export default config;
