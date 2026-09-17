import { defineChain } from 'viem';

export const arcNetwork = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Arc',
  nativeCurrency: {
    decimals: 18,
    name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME || 'USDC',
    symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL || 'USDC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.arc.io'],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || 'https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: process.env.NEXT_PUBLIC_EXPLORER_NAME || 'Arc Explorer',
      url: process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://explorer.arc.io',
    },
  },
  testnet: false,
});

export const arcNetworkTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network'] },
    public: { http: ['https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
});

export function arcAddEthereumChainParams() {
  const explorerUrl = arcNetwork.blockExplorers?.default.url;

  return {
    chainId: `0x${arcNetwork.id.toString(16)}`,
    chainName: arcNetwork.name,
    nativeCurrency: arcNetwork.nativeCurrency,
    rpcUrls: [...arcNetwork.rpcUrls.default.http],
    blockExplorerUrls: explorerUrl ? [explorerUrl] : undefined,
  };
}

export function transactionUrl(hash: string, chain = arcNetwork) {
  const baseUrl = chain.blockExplorers?.default.url.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/tx/${hash}` : undefined;
}
