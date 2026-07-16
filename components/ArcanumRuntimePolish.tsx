'use client';

import { useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { arcAddEthereumChainParams, arcNetworkTestnet } from '../lib/chain';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ProviderError = {
  code?: number;
  message?: string;
};

function isUnknownChain(error: unknown) {
  const walletError = error as ProviderError;
  const message = walletError.message?.toLowerCase() ?? '';

  return (
    walletError.code === 4902 ||
    message.includes('unrecognized') ||
    message.includes('unknown chain') ||
    message.includes('not added') ||
    message.includes('does not exist')
  );
}

async function switchToArc() {
  const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  const params = arcAddEthereumChainParams();

  if (!provider) {
    return;
  }

  try {
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] });
  } catch (error) {
    if (!isUnknownChain(error)) {
      throw error;
    }

    await provider.request({ method: 'wallet_addEthereumChain', params: [params] });
    await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] });
  }
}

function polishHeader() {
  const logo = document.querySelector<HTMLImageElement>('img[alt="Arcanum logo"]');
  logo?.classList.remove('h-11', 'w-11', 'object-cover', 'border', 'border-zinc-800', 'rounded-md');
  logo?.classList.add('h-9', 'w-28', 'object-contain', 'sm:h-11', 'sm:w-40');

  document.querySelectorAll<HTMLElement>('header span').forEach((node) => {
    const text = node.textContent?.trim().toLowerCase();
    if (text === 'on-chain' || text === 'arc ready' || text === 'arc hazır') {
      node.style.display = 'none';
    }
  });
}

export default function ArcanumRuntimePolish() {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  useEffect(() => {
    polishHeader();
    const observer = new MutationObserver(polishHeader);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isConnected || chainId === arcNetworkTestnet.id) {
      return;
    }

    void switchToArc().catch(() => undefined);
  }, [chainId, isConnected]);

  useEffect(() => {
    function handleSwitchClick(event: MouseEvent) {
      const button = (event.target as HTMLElement | null)?.closest('button');
      const text = button?.textContent?.toLowerCase() ?? '';

      if (!button || (!text.includes('switch to arc') && !text.includes('arc ağına geç'))) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      void switchToArc().catch(() => undefined);
    }

    document.addEventListener('click', handleSwitchClick, true);
    return () => document.removeEventListener('click', handleSwitchClick, true);
  }, []);

  return null;
}
