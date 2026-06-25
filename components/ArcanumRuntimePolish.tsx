'use client';

import { useEffect, useState } from 'react';
import { Github } from 'lucide-react';
import { useAccount, useChainId } from 'wagmi';
import { arcAddEthereumChainParams, arcNetworkTestnet } from '../lib/chain';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type ProviderError = {
  code?: number;
  message?: string;
};

const xProfileUrl = 'https://x.com/0xFatih';
const githubRepoUrl = 'https://github.com/FatihX1X/Arcanum';

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
  const [nativeFooterExists, setNativeFooterExists] = useState(false);

  useEffect(() => {
    polishHeader();
    setNativeFooterExists(Boolean(document.querySelector('footer')));
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

  if (nativeFooterExists) {
    return null;
  }

  return (
    <footer className="surface mx-auto mt-4 flex w-full max-w-[1500px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-zinc-500">Arcanum Private Messaging Protocol</p>
      <div className="flex flex-wrap items-center gap-2">
        <a href={xProfileUrl} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-xs">
          <span className="font-semibold">X</span>
          0xFatih
        </a>
        <a href={githubRepoUrl} target="_blank" rel="noreferrer" className="btn-ghost h-9 px-3 text-xs">
          <Github size={14} />
          GitHub
        </a>
      </div>
    </footer>
  );
}
