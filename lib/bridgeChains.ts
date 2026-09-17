import {
  ArbitrumSepolia,
  ArcTestnet,
  AvalancheFuji,
  BaseSepolia,
  CodexTestnet,
  CronosTestnet,
  EdgeTestnet,
  EthereumSepolia,
  HyperEVMTestnet,
  InjectiveTestnet,
  InkTestnet,
  LineaSepolia,
  MonadTestnet,
  MorphTestnet,
  OptimismSepolia,
  PharosTestnet,
  PlumeTestnet,
  PolygonAmoy,
  SeiTestnet,
  SonicTestnet,
  UnichainSepolia,
  WorldChainSepolia,
  XDCApothem,
} from '@circle-fin/bridge-kit/chains';
import { defineChain, type Chain } from 'viem';

import { arcNetwork, arcNetworkTestnet } from './chain';

export const bridgeEvmTestnets = [
  ArcTestnet,
  ArbitrumSepolia,
  AvalancheFuji,
  BaseSepolia,
  CodexTestnet,
  CronosTestnet,
  EdgeTestnet,
  EthereumSepolia,
  HyperEVMTestnet,
  InjectiveTestnet,
  InkTestnet,
  LineaSepolia,
  MonadTestnet,
  MorphTestnet,
  OptimismSepolia,
  PharosTestnet,
  PlumeTestnet,
  PolygonAmoy,
  SeiTestnet,
  SonicTestnet,
  UnichainSepolia,
  WorldChainSepolia,
  XDCApothem,
] as const;

export type BridgeEvmTestnet = (typeof bridgeEvmTestnets)[number];
export type BridgeChainKey = BridgeEvmTestnet['chain'];

export const arcBridgeChain = ArcTestnet;
export const defaultBridgeCounterpart = EthereumSepolia;

function explorerBase(explorerUrl: string) {
  return explorerUrl.replace(/\/tx\/\{hash\}\/?$/, '').replace(/\/$/, '');
}

function toViemChain(chain: BridgeEvmTestnet): Chain {
  if (chain.chainId === arcNetworkTestnet.id) return arcNetworkTestnet;
  return defineChain({
    id: chain.chainId,
    name: chain.name,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: {
      default: { http: [...chain.rpcEndpoints] },
      public: { http: [...chain.rpcEndpoints] },
    },
    blockExplorers: {
      default: {
        name: `${chain.name} Explorer`,
        url: explorerBase(chain.explorerUrl),
      },
    },
    testnet: true,
  });
}

export const bridgeWagmiChains = [arcNetwork, ...bridgeEvmTestnets.map(toViemChain)] as [
  Chain,
  ...Chain[],
];

export const bridgeChainById = new Map<number, BridgeEvmTestnet>(
  bridgeEvmTestnets.map((chain) => [chain.chainId, chain]),
);

export const bridgeChainByKey = new Map<BridgeChainKey, BridgeEvmTestnet>(
  bridgeEvmTestnets.map((chain) => [chain.chain, chain]),
);

export function bridgeDestinationsFor(source: BridgeEvmTestnet) {
  if (source.chain !== arcBridgeChain.chain) return [arcBridgeChain];
  return bridgeEvmTestnets.filter((chain) => (
    chain.chain !== arcBridgeChain.chain
    && chain.cctp?.forwarderSupported.destination === true
  ));
}

export function isSupportedArcBridgeRoute(
  source: BridgeEvmTestnet,
  destination: BridgeEvmTestnet,
) {
  const exactlyOneArc = (
    source.chain === arcBridgeChain.chain
  ) !== (
    destination.chain === arcBridgeChain.chain
  );
  return exactlyOneArc
    && source.isTestnet
    && destination.isTestnet
    && source.type === 'evm'
    && destination.type === 'evm'
    && destination.cctp?.forwarderSupported.destination === true;
}

export function bridgeExplorerUrl(chain: BridgeEvmTestnet, hash: string) {
  return chain.explorerUrl.replace('{hash}', hash);
}
