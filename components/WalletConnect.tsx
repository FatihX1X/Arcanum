'use client';

import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  return (
    <div className="flex flex-col items-center gap-6">
      {isConnected ? (
        <div className="bg-zinc-900 border border-zinc-700 rounded-3xl p-8 w-full max-w-md text-center">
          <p className="text-green-400 text-xl mb-2">✅ Connected</p>
          <p className="font-mono text-sm break-all text-zinc-300">{address}</p>
          <button 
            onClick={() => disconnect()}
            className="mt-6 w-full bg-red-600 hover:bg-red-700 py-3.5 rounded-2xl font-medium transition"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button 
          onClick={() => connect({ connector: injected() })}
          className="bg-white hover:bg-zinc-100 text-black px-12 py-5 rounded-3xl text-xl font-semibold transition w-full max-w-md"
        >
          Cüzdanı Bağla (MetaMask / Rabby)
        </button>
      )}
    </div>
  );
}