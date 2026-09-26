require('@nomicfoundation/hardhat-toolbox');

const arcMainnetRpcUrl = process.env.ARC_MAINNET_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.arc.io';
const arcTestnetRpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.io';
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const arcMainnetChainId = Number(process.env.ARC_MAINNET_CHAIN_ID || 5042);
const arcTestnetChainId = Number(process.env.ARC_TESTNET_CHAIN_ID || 5042002);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {},
    arcMainnet: {
      url: arcMainnetRpcUrl,
      chainId: arcMainnetChainId,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
    arcTestnet: {
      url: arcTestnetRpcUrl,
      chainId: arcTestnetChainId,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      arcMainnet: 'blockscout',
      arcTestnet: 'blockscout',
    },
    customChains: [
      {
        network: 'arcMainnet',
        chainId: arcMainnetChainId,
        urls: {
          apiURL: 'https://explorer.arc.io/api',
          browserURL: 'https://explorer.arc.io',
        },
      },
      {
        network: 'arcTestnet',
        chainId: arcTestnetChainId,
        urls: {
          apiURL: 'https://explorer.testnet.arc.io/api',
          browserURL: 'https://explorer.testnet.arc.io',
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
