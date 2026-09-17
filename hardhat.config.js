require('@nomicfoundation/hardhat-toolbox');

const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const accounts = deployerPrivateKey ? [deployerPrivateKey] : [];

const arcTestnetRpcUrl = process.env.ARC_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.arc.network';
const arcTestnetChainId = Number(process.env.ARC_TESTNET_CHAIN_ID || 5042002);

const arcMainnetRpcUrl = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const arcMainnetChainId = Number(process.env.ARC_MAINNET_CHAIN_ID || 5042);

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
    arcTestnet: {
      url: arcTestnetRpcUrl,
      chainId: arcTestnetChainId,
      accounts,
    },
    arcMainnet: {
      url: arcMainnetRpcUrl,
      chainId: arcMainnetChainId,
      accounts,
    },
  },
  etherscan: {
    apiKey: {
      arcTestnet: 'blockscout',
      arcMainnet: 'blockscout',
    },
    customChains: [
      {
        network: 'arcTestnet',
        chainId: arcTestnetChainId,
        urls: {
          apiURL: 'https://testnet.arcscan.app/api',
          browserURL: 'https://testnet.arcscan.app',
        },
      },
      {
        network: 'arcMainnet',
        chainId: arcMainnetChainId,
        urls: {
          apiURL: 'https://explorer.arc.io/api',
          browserURL: 'https://explorer.arc.io',
        },
      },
    ],
  },
  sourcify: {
    enabled: false,
  },
};
