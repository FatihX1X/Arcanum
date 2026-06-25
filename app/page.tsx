import WalletConnect from '../components/WalletConnect';
import ArcanumRuntimePolish from '../components/ArcanumRuntimePolish';

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-4 text-white sm:px-6 lg:px-8">
      <WalletConnect />
      <ArcanumRuntimePolish />
    </main>
  );
}
