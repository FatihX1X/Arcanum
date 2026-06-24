'use client';

import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, Lock, Send, Shield, Wallet, X } from 'lucide-react';
import { useAccount, useConnect, useDisconnect } from 'wagmi';

type PrivacyMode = 'private' | 'public';

type PreparedMessage = {
  recipient: string;
  message: string;
  privacy: PrivacyMode;
  createdAt: string;
};

const addressPattern = /^0x[a-fA-F0-9]{40}$/;

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connectors, connect, error, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [preparedMessage, setPreparedMessage] = useState<PreparedMessage | null>(null);

  const injectedConnector = connectors[0];
  const normalizedRecipient = recipient.trim();
  const normalizedMessage = message.trim();

  const recipientIsValid = useMemo(
    () => addressPattern.test(normalizedRecipient),
    [normalizedRecipient],
  );

  const canPrepareMessage = isConnected && recipientIsValid && normalizedMessage.length > 0;

  function handlePrepareMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canPrepareMessage) {
      return;
    }

    setPreparedMessage({
      recipient: normalizedRecipient,
      message: normalizedMessage,
      privacy,
      createdAt: new Date().toLocaleString('tr-TR'),
    });
  }

  return (
    <section className="mx-auto w-full max-w-2xl rounded-lg border border-zinc-800 bg-zinc-950/90 shadow-2xl shadow-black/25">
      <div className="border-b border-zinc-800 p-5 sm:p-6">
        {isConnected && address ? (
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-zinc-400">Cüzdan bağlı</p>
                <p className="font-mono text-sm text-zinc-100">{shortenAddress(address)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => disconnect()}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
            >
              <X size={16} aria-hidden="true" />
              Bağlantıyı kes
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-zinc-950">
              <Wallet size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Arcanum Messenger</h2>
              <p className="mt-1 text-sm text-zinc-400">Başlamak için cüzdanını bağla.</p>
            </div>
            <button
              type="button"
              disabled={!injectedConnector || isPending}
              onClick={() => injectedConnector && connect({ connector: injectedConnector })}
              className="inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Wallet size={18} aria-hidden="true" />
              {isPending ? 'Bağlanıyor...' : 'Cüzdanı Bağla'}
            </button>
            {error ? <p className="text-sm text-red-300">{error.message}</p> : null}
          </div>
        )}
      </div>

      <form onSubmit={handlePrepareMessage} className="space-y-5 p-5 sm:p-6">
        <div className="space-y-2">
          <label htmlFor="recipient" className="text-sm font-medium text-zinc-200">
            Alıcı adresi
          </label>
          <input
            id="recipient"
            value={recipient}
            onChange={(event) => setRecipient(event.target.value)}
            disabled={!isConnected}
            placeholder="0x..."
            className="h-12 w-full rounded-md border border-zinc-800 bg-zinc-900 px-4 font-mono text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {recipient && !recipientIsValid ? (
            <p className="text-sm text-amber-300">Geçerli bir EVM adresi gir.</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="message" className="text-sm font-medium text-zinc-200">
            Mesaj
          </label>
          <textarea
            id="message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            disabled={!isConnected}
            maxLength={280}
            rows={5}
            placeholder="Kısa ve özel mesajını yaz..."
            className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-900 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <p className="text-right text-xs text-zinc-500">{message.length}/280</p>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-zinc-200">Gizlilik</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => setPrivacy('private')}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                privacy === 'private'
                  ? 'bg-emerald-400 text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Lock size={16} aria-hidden="true" />
              Gizli
            </button>
            <button
              type="button"
              disabled={!isConnected}
              onClick={() => setPrivacy('public')}
              className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                privacy === 'public'
                  ? 'bg-sky-300 text-zinc-950'
                  : 'text-zinc-300 hover:bg-zinc-800'
              }`}
            >
              <Shield size={16} aria-hidden="true" />
              Açık
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={!canPrepareMessage}
          className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
        >
          <Send size={18} aria-hidden="true" />
          Mesajı hazırla
        </button>
      </form>

      {preparedMessage ? (
        <div className="border-t border-zinc-800 p-5 sm:p-6">
          <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-emerald-200">
              <CheckCircle2 size={16} aria-hidden="true" />
              Mesaj taslağı hazır
            </div>
            <dl className="space-y-2 text-sm text-zinc-300">
              <div>
                <dt className="text-zinc-500">Alıcı</dt>
                <dd className="break-all font-mono">{preparedMessage.recipient}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Gizlilik</dt>
                <dd>{preparedMessage.privacy === 'private' ? 'Gizli' : 'Açık'}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Mesaj</dt>
                <dd className="whitespace-pre-wrap">{preparedMessage.message}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Zaman</dt>
                <dd>{preparedMessage.createdAt}</dd>
              </div>
            </dl>
          </div>
        </div>
      ) : null}
    </section>
  );
}
