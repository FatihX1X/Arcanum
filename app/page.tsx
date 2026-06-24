import WalletConnect from '../components/WalletConnect';
import { arcanumMessengerAddress } from '../lib/contract';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-5xl flex-col justify-center gap-6">
        <header className="mx-auto w-full max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
            Arc Network Testnet
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Arcanum</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
            On-chain mesaj gönder, gizli mesajları tarayıcıda şifrele ve Inbox/Sent akışını zincirden oku.
          </p>
        </header>

        <WalletConnect />

        <p className="break-all text-center font-mono text-xs text-zinc-600">Contract: {arcanumMessengerAddress}</p>
      </div>
    </main>
  );
}
