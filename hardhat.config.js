require('@nomicfoundation/hardhat-toolbox');

const arcRpcUrl = process.env.ARC_TESTNET_RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.testnet.arc.network';
const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
const arcChainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID || process.env.ARC_TESTNET_CHAIN_ID || 5042002);

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
      chainId: arcChainId,
      accounts: deployerPrivateKey ? [deployerPrivateKey] : [],
    },
  },
};
