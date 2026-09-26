'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CreditCard, ExternalLink, RefreshCw, Wallet } from 'lucide-react';
import { useAccount, useSignMessage } from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import type { Address } from 'viem';
import type { Language } from './arcanumCopy';
import { Badge, Button } from './ui';

const copy = {
  en: {
    intro: 'Buy USDC or EURC with fiat and receive it in your wallet on Arc Mainnet.',
    destination: 'Destination wallet', start: 'Continue with Circle', restart: 'Start a new session',
    connect: 'Connect your wallet using the button above to choose where your funds arrive.',
    checking: 'Checking availability…', unavailable: 'Onramp is not available yet. Purchases will open once Circle production setup is complete.',
    loadError: 'Could not check availability. Please try again.', retry: 'Try again',
    signing: 'Confirm the sign-in message in your wallet. It does not authorize a payment.',
    loading: 'Opening Circle…', ready: 'Complete your purchase securely with Circle.',
    submitted: 'Payment submitted. Settlement may take time; check your wallet for the final balance.',
    settled: 'Circle reported settlement. Your wallet balance is refreshing.',
    expired: 'Your session expired. Start a new session to continue.',
    cancelled: 'The purchase was cancelled. You can start again when ready.',
    failed: 'Circle could not complete this step. Please try again.',
    eligibility: 'Payment methods and availability depend on your country and Circle’s verification. Review the fees and quote before paying.',
    details: 'About Circle Onramp', close: 'Close session',
  },
  tr: {
    intro: 'Fiat para ile USDC veya EURC satın alın; varlıklar Arc Mainnet cüzdanınıza gelsin.',
    destination: 'Alıcı cüzdan', start: 'Circle ile devam et', restart: 'Yeni oturum başlat',
    connect: 'Varlıkların gönderileceği adresi seçmek için üstteki düğmeden cüzdanınızı bağlayın.',
    checking: 'Kullanılabilirlik kontrol ediliyor…', unavailable: 'Onramp henüz kullanıma açık değil. Circle canlı ortam kurulumu tamamlandığında satın alma açılacak.',
    loadError: 'Kullanılabilirlik kontrol edilemedi. Lütfen tekrar deneyin.', retry: 'Tekrar dene',
    signing: 'Cüzdanınızda oturum açma mesajını onaylayın. Bu imza ödeme yetkisi vermez.',
    loading: 'Circle açılıyor…', ready: 'Satın alımınızı Circle üzerinden tamamlayın.',
    submitted: 'Ödeme gönderildi. Tamamlanması zaman alabilir; son bakiyeyi cüzdanınızdan kontrol edin.',
    settled: 'Circle işlemin tamamlandığını bildirdi. Cüzdan bakiyeniz yenileniyor.',
    expired: 'Oturumunuz sona erdi. Devam etmek için yeni oturum başlatın.',
    cancelled: 'Satın alma iptal edildi. Hazır olduğunuzda tekrar başlayabilirsiniz.',
    failed: 'Circle bu adımı tamamlayamadı. Lütfen tekrar deneyin.',
    eligibility: 'Ödeme yöntemleri ve kullanılabilirlik ülkenize ve Circle doğrulamasına bağlıdır. Ödemeden önce ücretleri ve teklifi kontrol edin.',
    details: 'Circle Onramp hakkında', close: 'Oturumu kapat',
  },
};
type Flow = 'idle' | 'signing' | 'loading' | 'ready' | 'submitted' | 'settled' | 'expired' | 'cancelled' | 'failed';

function OnrampPanel({ language, address }: { language: Language; address?: Address }) {
  const t = copy[language];
  const [available, setAvailable] = useState<boolean | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [flow, setFlow] = useState<Flow>('idle');
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<{ close: () => void } | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();
  const stop = useCallback(() => {
    generation.current++;
    widget.current?.close();
    widget.current = null;
    busy.current = false;
  }, []);

  useEffect(() => {
    const abort = new AbortController();
    setStatusError(false);
    fetch('/api/onramp/status', { signal: abort.signal, cache: 'no-store' })
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(data => { if (!abort.signal.aborted) setAvailable(data.configured === true); })
      .catch(() => { if (!abort.signal.aborted) setStatusError(true); });
    return () => { abort.abort(); stop(); };
  }, [attempt, stop]);

  function close() {
    stop();
    setFlow('idle');
  }

  async function start() {
    if (!address || !available || busy.current) return;
    close();
    busy.current = true;
    const current = generation.current;
    const active = () => generation.current === current;
    const update = (next: Flow) => { if (active()) setFlow(next); };
    try {
      update('signing');
      const challengeResponse = await fetch('/api/onramp/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
      if (!challengeResponse.ok) throw new Error();
      const { message } = await challengeResponse.json();
      if (!active()) return;
      const signature = await signMessageAsync({ message, account: address });
      if (!active()) return;
      update('loading');
      const response = await fetch('/api/onramp/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ signature }) });
      if (!response.ok) throw new Error();
      const session = await response.json();
      const { AppKit } = await import('@circle-fin/app-kit');
      if (!active() || !container.current) return;
      const kit = new AppKit({ onramp: { widgetBaseUrl: 'https://onramp.arc.io' } });
      widget.current = kit.onramp.mountIframe({
        session, container: container.current,
        onInitializationSuccess: () => update('ready'),
        onInitializationError: () => update('failed'),
        onDepositSubmitted: () => update('submitted'),
        onDepositSettled: () => {
          update('settled');
          if (active()) void queryClient.invalidateQueries({ predicate: query => ['balance', 'readContract'].includes(String(query.queryKey[0])) });
        },
        onDepositNotCompleted: ({ code }) => update(code === 'CANCELED_BY_CUSTOMER' ? 'cancelled' : code === 'SESSION_TIMEOUT' ? 'expired' : 'failed'),
        onSessionExpired: () => update('expired'),
      });
    } catch (error) {
      const cancelled = error && typeof error === 'object' && ('name' in error && String(error.name).includes('UserRejected'));
      update(cancelled ? 'cancelled' : 'failed');
    } finally { if (active()) busy.current = false; }
  }

  const pending = flow === 'signing' || flow === 'loading';
  return (
    <section className="panel min-h-[560px]" aria-label="Circle Onramp">
      <div className="panel-header flex flex-wrap items-start justify-between gap-4">
        <div><p className="eyebrow">Circle · Arc Mainnet</p><h1 className="panel-title mt-2 flex items-center gap-2"><CreditCard size={21} />Onramp</h1><p className="mt-3 max-w-2xl text-sm text-zinc-400">{t.intro}</p></div>
        <Badge>USDC / EURC</Badge>
      </div>
      <div className="mx-auto mt-8 max-w-2xl space-y-5">
        {address ? <div className="chat-card p-4"><p className="eyebrow flex items-center gap-2"><Wallet size={14} />{t.destination}</p><p className="mt-2 break-all font-mono text-xs text-zinc-300">{address}</p></div> : null}
        <div role="status" aria-live="polite" className="rounded-xl border border-zinc-700/30 p-5 text-sm leading-6 text-zinc-400">
          {statusError ? t.loadError : available === null ? t.checking : !available ? t.unavailable : !address ? t.connect : flow === 'idle' ? t.eligibility : t[flow]}
        </div>
        {statusError ? <Button variant="secondary" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={15} />{t.retry}</Button> : null}
        {available && address ? <div className="flex flex-wrap gap-3"><Button onClick={() => void start()} disabled={pending} loading={pending}>{flow === 'idle' ? t.start : t.restart}</Button>{flow !== 'idle' ? <Button variant="secondary" onClick={close}>{t.close}</Button> : null}</div> : null}
        <div ref={container} style={{ height: widget.current || flow === 'loading' || flow === 'ready' || flow === 'submitted' || flow === 'settled' ? 720 : 0 }} className="w-full overflow-hidden rounded-xl" />
        <p className="text-xs leading-5 text-zinc-500">{t.eligibility}</p>
        <a href="https://docs.arc.io/app-kit/onramp" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-xs text-zinc-400 hover:text-zinc-200">{t.details}<ExternalLink size={13} /></a>
      </div>
    </section>
  );
}

export default function CircleOnramp({ language }: { language: Language }) {
  const { address, isConnected } = useAccount();
  return <OnrampPanel key={isConnected ? address : 'disconnected'} language={language} address={isConnected ? address : undefined} />;
}
