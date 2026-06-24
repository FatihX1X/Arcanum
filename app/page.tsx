import WalletConnect from '../components/WalletConnect';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-4xl flex-col justify-center gap-6">
        <header className="mx-auto w-full max-w-2xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
            Arc Network Testnet
          </p>
          <h1 className="mt-3 text-4xl font-semibold text-white sm:text-5xl">Arcanum</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-400 sm:text-base">
            Basit cüzdan bağlantısı, alıcı adresi, mesaj alanı ve gizlilik seçimi olan minimal mesajlaşma arayüzü.
          </p>
        </header>

        <WalletConnect />

        <p className="text-center font-mono text-xs text-zinc-600">
          Contract: 0x8234Bfe1405d1765DE73A8b5d167cd99B74F58fD
        </p>
      </div>
    </main>
  );
}
