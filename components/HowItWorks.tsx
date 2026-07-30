'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Coins,
  Languages,
  LockKeyhole,
  MessageCircle,
  ShieldCheck,
  UsersRound,
} from 'lucide-react';
import type { Language } from './arcanumCopy';
import ArcanumBrand from './ArcanumBrand';

const content = {
  en: {
    eyebrow: 'Protocol guide', title: 'How Arcanum Works', intro: 'Arcanum combines browser-side encryption with immutable Arc Testnet delivery. Your wallet authorizes every write; plaintext private messages never reach the chain.',
    back: 'Back to Arcanum', language: 'Switch language', privateTitle: 'Private messages', privateBody: 'The browser derives an ECDH shared secret, encrypts with AES-GCM, and writes only ciphertext to ArcanumMessenger.',
    publicTitle: 'Public messages', publicBody: 'Plaintext is stored permanently on-chain. Use this mode only for information intended for everyone.',
    agentTitle: 'AI Agent messages', agentBody: 'Registered agents exchange public or encrypted payloads and can attach native USDC payments to the same transaction.',
    groupTitle: 'Encrypted group chat', groupBody: 'The browser encrypts the group name and messages with a per-epoch AES key, then wraps that epoch key separately for every active member.',
    bulkTitle: 'Bulk Sender', bulkBody: 'One payable contract call distributes Arc native USDC to up to 100 addresses atomically, with no allowance transaction or protocol fee.',
    wallet: 'Wallet signs', browser: 'Browser prepares', chain: 'Arc stores', recipient: 'Recipient reads', keyWraps: 'Member key wraps', approve: 'Review totals', rows: 'Address + amount rows', recipients: 'USDC recipients', batch: 'Atomic batch',
    rulesTitle: 'Security and settlement rules', rules: [
      'Private keys remain encrypted in local browser storage and must be unlocked per session.',
      'Removed group members keep historical access but receive no key for future messages.',
      'A membership change invalidates a prepared group transaction before it can be sent.',
      'Bulk payments are all-or-nothing: one failed transfer reverts the entire batch.',
      'Group member addresses, batch recipients, amounts, and public DMs are readable and permanent on-chain.',
    ],
  },
  tr: {
    eyebrow: 'Protokol rehberi', title: 'Arcanum Nasıl Çalışır?', intro: 'Arcanum, browser tarafı şifrelemeyi Arc Testnet üzerindeki kalıcı teslimatla birleştirir. Her yazma işlemini cüzdanın onaylar; private mesaj plaintext’i zincire ulaşmaz.',
    back: 'Arcanum’a dön', language: 'Dili değiştir', privateTitle: 'Private mesajlar', privateBody: 'Browser ECDH ortak sırrı üretir, AES-GCM ile şifreler ve ArcanumMessenger’a yalnızca ciphertext yazar.',
    publicTitle: 'Public mesajlar', publicBody: 'Plaintext kalıcı olarak on-chain saklanır. Bu modu yalnızca herkesin okuyabileceği bilgiler için kullan.',
    agentTitle: 'AI Agent mesajları', agentBody: 'Kayıtlı agentlar public veya şifreli payload gönderir ve aynı işleme native USDC ödemesi ekleyebilir.',
    groupTitle: 'Şifreli grup sohbeti', groupBody: 'Browser grup adını ve mesajları epoch başına AES anahtarıyla şifreler; epoch anahtarını her aktif üye için ayrı sarar.',
    bulkTitle: 'Bulk Sender', bulkBody: 'Tek payable contract çağrısı, allowance veya protokol ücreti olmadan native Arc USDC’yi 100 adrese kadar atomik olarak dağıtır.',
    wallet: 'Cüzdan imzalar', browser: 'Browser hazırlar', chain: 'Arc saklar', recipient: 'Alıcı okur', keyWraps: 'Üye anahtar zarfları', approve: 'Toplamları incele', rows: 'Adres + tutar satırları', recipients: 'USDC alıcıları', batch: 'Atomik batch',
    rulesTitle: 'Güvenlik ve ödeme kuralları', rules: [
      'Private key’ler browser local storage içinde şifreli kalır ve her oturumda unlock edilmelidir.',
      'Çıkarılan grup üyeleri geçmişi okuyabilir ancak gelecek mesaj anahtarlarını alamaz.',
      'Üyelik değişikliği, hazırlanmış eski sürümlü grup işlemini gönderilmeden geçersiz kılar.',
      'Bulk ödemeleri ya tamamen gerçekleşir ya da tek hata tüm batch’i geri alır.',
      'Grup üye adresleri, batch alıcıları, tutarlar ve public DM’ler on-chain okunabilir ve kalıcıdır.',
    ],
  },
} as const;

export function HowItWorks() {
  const [language, setLanguage] = useState<Language>('en');
  const copy = content[language];

  useEffect(() => {
    const stored = localStorage.getItem('arcanum.language');
    if (stored === 'en' || stored === 'tr') setLanguage(stored);
  }, []);

  function toggleLanguage() {
    const next = language === 'en' ? 'tr' : 'en';
    setLanguage(next);
    localStorage.setItem('arcanum.language', next);
  }

  return (
    <main className="app-page py-5">
      <div className="mx-auto w-full max-w-6xl">
        <header className="surface flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="inline-flex items-center gap-3">
            <ArcanumBrand />
          </Link>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={toggleLanguage} className="btn-ghost h-10 px-3" aria-label={copy.language}><Languages size={15} />{language.toUpperCase()}</button>
            <Link href="/" className="btn-primary h-10 px-4"><ArrowLeft size={15} />{copy.back}</Link>
          </div>
        </header>

        <section className="py-14 text-center sm:py-20">
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mx-auto mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-white sm:text-6xl">{copy.title}</h1>
          <p className="mx-auto mt-6 max-w-3xl text-base leading-8 text-zinc-400 sm:text-lg">{copy.intro}</p>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <FlowCard icon={<LockKeyhole size={22} />} title={copy.privateTitle} body={copy.privateBody} steps={[copy.wallet, copy.browser, copy.chain, copy.recipient]} />
          <FlowCard icon={<MessageCircle size={22} />} title={copy.publicTitle} body={copy.publicBody} steps={[copy.wallet, copy.chain, copy.recipient]} />
          <FlowCard icon={<Bot size={22} />} title={copy.agentTitle} body={copy.agentBody} steps={[copy.wallet, copy.browser, 'Agent contract', copy.recipient]} />
          <FlowCard icon={<UsersRound size={22} />} title={copy.groupTitle} body={copy.groupBody} steps={[copy.browser, copy.keyWraps, copy.chain, copy.recipient]} />
          <div className="lg:col-span-2">
            <FlowCard icon={<Coins size={22} />} title={copy.bulkTitle} body={copy.bulkBody} steps={[copy.approve, copy.rows, copy.batch, copy.recipients]} />
          </div>
        </section>

        <section className="panel my-12 sm:my-16">
          <div className="panel-header">
            <div><p className="eyebrow">Safety</p><h2 className="panel-title">{copy.rulesTitle}</h2></div>
            <ShieldCheck size={22} className="text-emerald-300" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {copy.rules.map((rule) => (
              <p key={rule} className="flex gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300"><CheckCircle2 size={17} className="mt-1 shrink-0 text-emerald-300" />{rule}</p>
            ))}
          </div>
        </section>

        <footer className="flex flex-col items-center justify-between gap-3 border-t border-zinc-800 py-6 text-xs text-zinc-500 sm:flex-row">
          <span>Arcanum Private Messaging Protocol · Arc Testnet</span>
          <Link href="/" className="text-accent inline-flex items-center gap-2">{copy.back}<ArrowRight size={13} /></Link>
        </footer>
      </div>
    </main>
  );
}

function FlowCard({ icon, title, body, steps }: { icon: ReactNode; title: string; body: string; steps: readonly string[] }) {
  return (
    <article className="panel h-full">
      <div className="badge-accent inline-flex h-11 w-11 items-center justify-center rounded-lg border">{icon}</div>
      <h2 className="mt-5 text-xl font-semibold text-white">{title}</h2>
      <p className="mt-3 text-sm leading-7 text-zinc-400">{body}</p>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {steps.map((step, index) => (
          <div key={step} className="contents">
            <span className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-xs text-zinc-300">{step}</span>
            {index < steps.length - 1 ? <ArrowRight size={13} className="text-zinc-600" /> : null}
          </div>
        ))}
      </div>
    </article>
  );
}
