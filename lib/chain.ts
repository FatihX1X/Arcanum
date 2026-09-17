import { defineChain } from 'viem';

export const arcNetwork = defineChain({
  id: 5042,
  name: 'Arc Mainnet',
  nativeCurrency: {
    decimals: 18,
    name: 'USDC',
    symbol: 'USDC',
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.mainnet.arc.io'],
    },
    public: {
      http: ['https://rpc.mainnet.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: 'https://explorer.arc.io',
    },
  },
  testnet: false,
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

export function transactionUrl(
  hash: string,
  chain: { blockExplorers?: { default: { url: string } } } = arcNetwork,
) {
  const baseUrl = chain.blockExplorers?.default.url.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/tx/${hash}` : undefined;
}
