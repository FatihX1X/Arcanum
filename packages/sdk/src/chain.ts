import { defineChain } from 'viem';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL, ARC_MAINNET_RPC_URL } from './generated/contracts';

export const arcMainnet = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: { decimals: 18, name: 'USDC', symbol: 'USDC' },
  rpcUrls: {
    default: { http: [ARC_MAINNET_RPC_URL] },
    public: { http: [ARC_MAINNET_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_MAINNET_EXPLORER_URL },
  },
  testnet: false,
});

export function arcAddEthereumChainParams() {
  return {
    chainId: `0x${arcMainnet.id.toString(16)}`,
    chainName: arcMainnet.name,
    nativeCurrency: arcMainnet.nativeCurrency,
    rpcUrls: [...arcMainnet.rpcUrls.default.http],
    blockExplorerUrls: [arcMainnet.blockExplorers.default.url],
  };
}

export function transactionUrl(
  hash: string,
  chain: { blockExplorers?: { default: { url: string } } } = arcMainnet,
) {
  const baseUrl = chain.blockExplorers?.default.url.replace(/\/$/, '');
  return baseUrl ? `${baseUrl}/tx/${hash}` : undefined;
}
