import {
  Arbitrum,
  Arc,
  Avalanche,
  Base,
  Codex,
  Cronos,
  Edge,
  Ethereum,
  HyperEVM,
  Injective,
  Ink,
  Linea,
  Monad,
  Morph,
  Optimism,
  Pharos,
  Plasma,
  Plume,
  Polygon,
  Sei,
  Sonic,
  Unichain,
  WorldChain,
  XDC,
  XLayer,
} from '@circle-fin/bridge-kit/chains';
import { defineChain, type Chain } from 'viem';

import { arcNetwork } from './chain';

export const bridgeEvmChains = [
  Arc,
  Ethereum,
  Base,
  Arbitrum,
  Optimism,
  Polygon,
  Avalanche,
  Linea,
  Unichain,
  WorldChain,
  Ink,
  HyperEVM,
  Monad,
  Morph,
  Sei,
  Sonic,
  Codex,
  Cronos,
  Edge,
  Injective,
  Pharos,
  Plasma,
  Plume,
  XDC,
  XLayer,
] as const;

export type BridgeEvmChain = (typeof bridgeEvmChains)[number];
export type BridgeChainKey = BridgeEvmChain['chain'];

/** @deprecated Use bridgeEvmChains — kept for call-site compatibility during the mainnet cutover. */
export const bridgeEvmTestnets = bridgeEvmChains;
/** @deprecated Use BridgeEvmChain */
export type BridgeEvmTestnet = BridgeEvmChain;

export const arcBridgeChain = Arc;
export const defaultBridgeCounterpart = Ethereum;

function explorerBase(explorerUrl: string) {
  return explorerUrl.replace(/\/tx\/\{hash\}\/?$/, '').replace(/\/$/, '');
}

function toViemChain(chain: BridgeEvmChain): Chain {
  if (chain.chainId === arcNetwork.id) return arcNetwork;
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
    testnet: false,
  });
}

export const bridgeWagmiChains = bridgeEvmChains.map(toViemChain) as [Chain, ...Chain[]];

export const bridgeChainById = new Map<number, BridgeEvmChain>(
  bridgeEvmChains.map((chain) => [chain.chainId, chain]),
);

export const bridgeChainByKey = new Map<BridgeChainKey, BridgeEvmChain>(
  bridgeEvmChains.map((chain) => [chain.chain, chain]),
);

export function bridgeDestinationsFor(source: BridgeEvmChain) {
  if (source.chain !== arcBridgeChain.chain) return [arcBridgeChain];
  return bridgeEvmChains.filter((chain) => (
    chain.chain !== arcBridgeChain.chain
    && chain.cctp?.forwarderSupported.destination === true
  ));
}

export function isSupportedArcBridgeRoute(
  source: BridgeEvmChain,
  destination: BridgeEvmChain,
) {
  const exactlyOneArc = (
    source.chain === arcBridgeChain.chain
  ) !== (
    destination.chain === arcBridgeChain.chain
  );
  return exactlyOneArc
    && !source.isTestnet
    && !destination.isTestnet
    && source.type === 'evm'
    && destination.type === 'evm'
    && destination.cctp?.forwarderSupported.destination === true;
}

export function bridgeExplorerUrl(chain: BridgeEvmChain, hash: string) {
  return chain.explorerUrl.replace('{hash}', hash);
}
