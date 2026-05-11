'use client';

import WalletConnect from '../components/WalletConnect';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto pt-12">
        <div className="text-center mb-12">
          <h1 className="text-6xl font-bold mb-3">🔐 Arcanum</h1>
          <p className="text-xl text-zinc-400">Private On-Chain Messaging</p>
          <p className="text-zinc-500">Arc Network Testnet</p>
        </div>
        <WalletConnect />
        <div className="mt-12 text-center text-xs text-zinc-500 font-mono">
          Contract: 0x8234Bfe1405d1765DE73A8b5d167cd99B74F58fD
        </div>
      </div>
    </div>
  );
}