'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ExternalLink,
  Inbox,
  KeyRound,
  Lock,
  RefreshCw,
  Send,
  Shield,
  Wallet,
  X,
} from 'lucide-react';
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useReadContract,
  useSwitchChain,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi';
import { isAddress, zeroAddress } from 'viem';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import { arcanumMessengerAbi, arcanumMessengerAddress, type ChainMessage } from '../lib/contract';
import { decryptMessage, encryptMessage, ensureEncryptionKeyPair } from '../lib/crypto';

type PrivacyMode = 'private' | 'public';
type TabMode = 'inbox' | 'sent';

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp: bigint) {
  if (timestamp === BigInt(0)) {
    return '-';
  }

  return new Date(Number(timestamp) * 1000).toLocaleString('tr-TR');
}

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, error: connectError, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchPending, error: switchError } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending, error: writeError } = useWriteContract();
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [tab, setTab] = useState<TabMode>('inbox');
  const [status, setStatus] = useState('');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();

  const injectedConnector = connectors[0];
  const normalizedRecipient = recipient.trim();
  const normalizedMessage = message.trim();
  const recipientIsValid = isAddress(normalizedRecipient);
  const connectedAddress = address ?? zeroAddress;
  const isCorrectChain = chainId === arcNetworkTestnet.id;

  const { data: ownEncryptionKey, refetch: refetchOwnKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [connectedAddress],
    query: {
      enabled: isConnected,
    },
  });

  const { data: recipientEncryptionKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [recipientIsValid ? (normalizedRecipient as `0x${string}`) : zeroAddress],
    query: {
      enabled: isConnected && privacy === 'private' && recipientIsValid,
    },
  });

  const {
    data: inboxMessages,
    refetch: refetchInbox,
    isFetching: isInboxFetching,
  } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getInbox',
    args: [connectedAddress],
    query: {
      enabled: isConnected,
    },
  });

  const {
    data: sentMessages,
    refetch: refetchSent,
    isFetching: isSentFetching,
  } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getOutbox',
    args: [connectedAddress],
    query: {
      enabled: isConnected,
    },
  });

  const receipt = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: {
      enabled: Boolean(pendingHash),
    },
  });

  const canSend = useMemo(() => {
    return isConnected && isCorrectChain && recipientIsValid && normalizedMessage.length > 0 && !isWritePending;
  }, [isConnected, isCorrectChain, recipientIsValid, normalizedMessage.length, isWritePending]);

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus('İşlem onaylandı. Mesaj zincire yazıldı.');
      setMessage('');
      setPendingHash(undefined);
      void refetchInbox();
      void refetchSent();
      void refetchOwnKey();
    }
  }, [receipt.isSuccess, refetchInbox, refetchOwnKey, refetchSent]);

  async function handleRegisterKey() {
    if (!address || !isCorrectChain) {
      return;
    }

    setFlowError('');
    setStatus('Şifreleme anahtarı hazırlanıyor...');

    try {
      const keyPair = await ensureEncryptionKeyPair(address);
      setStatus('Cüzdan onayı bekleniyor...');
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'registerEncryptionKey',
        args: [keyPair.publicKey],
      });

      setPendingHash(hash);
      setStatus('Anahtar kayıt işlemi zincirde bekliyor...');
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : 'Anahtar kaydı başarısız oldu.');
      setStatus('');
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!address || !canSend) {
      return;
    }

    if (privacy === 'private' && !recipientEncryptionKey) {
      setFlowError('Alıcının şifreleme anahtarı yok. Alıcı önce Arcanum’a kayıt olmalı.');
      return;
    }

    setFlowError('');
    setStatus(privacy === 'private' ? 'Mesaj browser içinde şifreleniyor...' : 'Mesaj hazırlanıyor...');

    try {
      const payload =
        privacy === 'private'
          ? await encryptMessage(normalizedMessage, String(recipientEncryptionKey), address)
          : normalizedMessage;

      setStatus('Cüzdan onayı bekleniyor...');
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'sendMessage',
        args: [normalizedRecipient as `0x${string}`, payload, privacy === 'private'],
      });

      setPendingHash(hash);
      setStatus('İşlem zincirde bekliyor...');
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : 'Mesaj gönderilemedi.');
      setStatus('');
    }
  }

  const visibleMessages = (tab === 'inbox' ? inboxMessages : sentMessages) as ChainMessage[] | undefined;
  const isFetchingMessages = tab === 'inbox' ? isInboxFetching : isSentFetching;
  const latestTxUrl = pendingHash ? transactionUrl(pendingHash) : undefined;

  return (
    <section className="mx-auto w-full max-w-4xl rounded-lg border border-zinc-800 bg-zinc-950/90 shadow-2xl shadow-black/25">
      <div className="border-b border-zinc-800 p-5 sm:p-6">
        {isConnected && address ? (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300">
                <CheckCircle2 size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm text-zinc-400">Cüzdan bağlı</p>
                <p className="font-mono text-sm text-zinc-100">{shortenAddress(address)}</p>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              {!isCorrectChain ? (
                <button
                  type="button"
                  onClick={() => switchChain({ chainId: arcNetworkTestnet.id })}
                  disabled={isSwitchPending}
                  className="inline-flex h-10 items-center justify-center rounded-md bg-amber-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSwitchPending ? 'Ağ değiştiriliyor...' : 'Arc Network’e geç'}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => disconnect()}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                <X size={16} aria-hidden="true" />
                Bağlantıyı kes
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-white text-zinc-950">
              <Wallet size={22} aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">Arcanum Messenger</h2>
              <p className="mt-1 text-sm text-zinc-400">On-chain mesajlaşmak için cüzdanını bağla.</p>
            </div>
            <button
              type="button"
              disabled={!injectedConnector || isConnectPending}
              onClick={() => injectedConnector && connect({ connector: injectedConnector })}
              className="inline-flex h-12 w-full max-w-xs items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-zinc-950 transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Wallet size={18} aria-hidden="true" />
              {isConnectPending ? 'Bağlanıyor...' : 'Cüzdanı Bağla'}
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:p-6">
        <div className="space-y-5">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">Şifreleme anahtarı</p>
                <p className="text-xs text-zinc-500">Gizli mesaj alabilmek için public key zincire kaydedilir.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs ${ownEncryptionKey ? 'bg-emerald-400/10 text-emerald-200' : 'bg-zinc-800 text-zinc-400'}`}>
                {ownEncryptionKey ? 'Kayıtlı' : 'Gerekli'}
              </span>
            </div>
            <button
              type="button"
              disabled={!isConnected || !isCorrectChain || isWritePending || Boolean(ownEncryptionKey)}
              onClick={handleRegisterKey}
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <KeyRound size={16} aria-hidden="true" />
              {ownEncryptionKey ? 'Anahtar kayıtlı' : 'Anahtarı oluştur ve kaydet'}
            </button>
          </div>

          <form onSubmit={handleSendMessage} className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
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
                className="h-12 w-full rounded-md border border-zinc-800 bg-zinc-950 px-4 font-mono text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {recipient && !recipientIsValid ? <p className="text-sm text-amber-300">Geçerli bir EVM adresi gir.</p> : null}
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
                placeholder="Mesajını yaz..."
                className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm leading-6 text-white outline-none transition placeholder:text-zinc-600 focus:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-right text-xs text-zinc-500">{message.length}/280</p>
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-zinc-200">Gizlilik</p>
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => setPrivacy('private')}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${privacy === 'private' ? 'bg-emerald-400 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <Lock size={16} aria-hidden="true" />
                  Gizli
                </button>
                <button
                  type="button"
                  disabled={!isConnected}
                  onClick={() => setPrivacy('public')}
                  className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${privacy === 'public' ? 'bg-sky-300 text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}
                >
                  <Shield size={16} aria-hidden="true" />
                  Açık
                </button>
              </div>
              {privacy === 'private' && recipientIsValid && !recipientEncryptionKey ? (
                <p className="text-sm text-amber-300">Alıcı önce Arcanum’a şifreleme anahtarı kaydetmeli.</p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={!canSend || (privacy === 'private' && !recipientEncryptionKey)}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-emerald-400 px-5 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              <Send size={18} aria-hidden="true" />
              {isWritePending ? 'Cüzdan bekleniyor...' : 'Zincire gönder'}
            </button>
          </form>

          {status || flowError || connectError || switchError || writeError ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
              {status ? <p className="text-emerald-200">{status}</p> : null}
              {latestTxUrl ? (
                <a
                  href={latestTxUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200"
                >
                  Explorer’da görüntüle
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ) : null}
              {[flowError, connectError?.message, switchError?.message, writeError?.message]
                .filter(Boolean)
                .map((messageText) => (
                  <p key={messageText} className="mt-2 break-words text-red-300">
                    {messageText}
                  </p>
                ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
              <button
                type="button"
                onClick={() => setTab('inbox')}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${tab === 'inbox' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Inbox size={16} aria-hidden="true" />
                Inbox
              </button>
              <button
                type="button"
                onClick={() => setTab('sent')}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${tab === 'sent' ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}
              >
                <Send size={16} aria-hidden="true" />
                Sent
              </button>
            </div>
            <button
              type="button"
              disabled={!isConnected || isFetchingMessages}
              onClick={() => (tab === 'inbox' ? refetchInbox() : refetchSent())}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-zinc-700 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Mesajları yenile"
            >
              <RefreshCw size={16} className={isFetchingMessages ? 'animate-spin' : ''} aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3">
            {!isConnected ? <p className="text-sm text-zinc-500">Mesajları görmek için cüzdan bağla.</p> : null}
            {isConnected && visibleMessages?.length === 0 ? <p className="text-sm text-zinc-500">Henüz mesaj yok.</p> : null}
            {visibleMessages?.map((chainMessage) => (
              <MessageCard key={`${tab}-${chainMessage.id.toString()}`} message={chainMessage} viewer={address} mode={tab} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function MessageCard({
  message,
  viewer,
  mode,
}: {
  message: ChainMessage;
  viewer?: `0x${string}`;
  mode: TabMode;
}) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function decryptPrivateMessage() {
      if (!message.isPrivate || mode !== 'inbox' || !viewer) {
        setDecrypted(null);
        setDecryptError('');
        return;
      }

      try {
        const value = await decryptMessage(message.payload, viewer);
        if (!cancelled) {
          setDecrypted(value);
          setDecryptError('');
        }
      } catch {
        if (!cancelled) {
          setDecrypted(null);
          setDecryptError('Bu gizli mesaj bu cihazdaki anahtarla çözülemedi.');
        }
      }
    }

    void decryptPrivateMessage();

    return () => {
      cancelled = true;
    };
  }, [message.isPrivate, message.payload, mode, viewer]);

  const body = message.isPrivate ? decrypted ?? 'Şifreli payload zincirde saklanıyor.' : message.payload;

  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${message.isPrivate ? 'bg-emerald-400/10 text-emerald-200' : 'bg-sky-300/10 text-sky-200'}`}>
          {message.isPrivate ? <Lock size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
          {message.isPrivate ? 'Gizli' : 'Açık'}
        </span>
        <span className="text-xs text-zinc-500">#{message.id.toString()}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{body}</p>
      {decryptError ? <p className="mt-2 text-sm text-amber-300">{decryptError}</p> : null}
      <dl className="mt-4 space-y-1 text-xs text-zinc-500">
        <div>
          <dt className="inline">Gönderen: </dt>
          <dd className="inline font-mono">{shortenAddress(message.sender)}</dd>
        </div>
        <div>
          <dt className="inline">Alıcı: </dt>
          <dd className="inline font-mono">{shortenAddress(message.recipient)}</dd>
        </div>
        <div>
          <dt className="inline">Zaman: </dt>
          <dd className="inline">{formatTimestamp(message.timestamp)}</dd>
        </div>
      </dl>
    </article>
  );
}
