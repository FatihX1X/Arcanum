import { defineChain } from 'viem';

const fallbackRpcUrl = 'https://rpc.testnet.arc.network';
const fallbackExplorerUrl = 'https://testnet.arcscan.app';

export const arcNetworkTestnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_CHAIN_ID || 5042002),
  name: process.env.NEXT_PUBLIC_CHAIN_NAME || 'Arc Testnet',
  nativeCurrency: {
    decimals: 18,
    name: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_NAME || 'USDC',
    symbol: process.env.NEXT_PUBLIC_NATIVE_CURRENCY_SYMBOL || 'USDC',
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || fallbackRpcUrl],
    },
    public: {
      http: [process.env.NEXT_PUBLIC_RPC_URL || fallbackRpcUrl],
    },
  },
  blockExplorers: {
    default: {
      name: process.env.NEXT_PUBLIC_EXPLORER_NAME || 'ArcScan',
      url: process.env.NEXT_PUBLIC_EXPLORER_URL || fallbackExplorerUrl,
    },
  },
  testnet: true,
});

export function transactionUrl(hash: string) {
  const baseUrl = arcNetworkTestnet.blockExplorers?.default.url.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/tx/${hash}` : undefined;
}
