'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { arcNetworkTestnet } from '../lib/chain';

const config = createConfig({
  ssr: true,
  chains: [arcNetworkTestnet],
  connectors: [
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [arcNetworkTestnet.id]: http(arcNetworkTestnet.rpcUrls.default.http[0], {
      batch: { batchSize: 20, wait: 16 },
      retryCount: 4,
      retryDelay: 500,
    }),
  },
});

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
    },
  }));

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
