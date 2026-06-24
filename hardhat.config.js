require('@nomicfoundation/hardhat-toolbox');

const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'http://127.0.0.1:8545';
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const arcChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.ARC_TESTNET_CHAIN_ID || 0);

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
      url: arcRpcUrl,
      chainId: arcChainId || undefined,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
};
