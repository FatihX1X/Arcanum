'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Inbox,
  KeyRound,
  Lock,
  RefreshCw,
  Send,
  Shield,
  Wallet,
  Wifi,
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
import {
  arcanumMessengerAbi,
  arcanumMessengerAddress,
  isArcanumMessengerConfigured,
  type ChainMessage,
} from '../lib/contract';
import { decryptMessage, encryptMessage, ensureEncryptionKeyPair } from '../lib/crypto';

type PrivacyMode = 'private' | 'public';
type TabMode = 'inbox' | 'sent';
type NoticeTone = 'idle' | 'pending' | 'success' | 'error';

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
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('idle');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();

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
      enabled: isConnected && isArcanumMessengerConfigured,
    },
  });

  const { data: recipientEncryptionKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [recipientIsValid ? (normalizedRecipient as `0x${string}`) : zeroAddress],
    query: {
      enabled: isConnected && isArcanumMessengerConfigured && privacy === 'private' && recipientIsValid,
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
      enabled: isConnected && isArcanumMessengerConfigured,
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
      enabled: isConnected && isArcanumMessengerConfigured,
    },
  });

  const receipt = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: {
      enabled: Boolean(pendingHash),
    },
  });

  const canSend = useMemo(() => {
    return (
      isConnected &&
      isArcanumMessengerConfigured &&
      isCorrectChain &&
      recipientIsValid &&
      normalizedMessage.length > 0 &&
      !isWritePending
    );
  }, [isConnected, isCorrectChain, recipientIsValid, normalizedMessage.length, isWritePending]);

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus('İşlem onaylandı. Mesaj zincire yazıldı.');
      setNoticeTone('success');
      setMessage('');
      setPendingHash(undefined);
      void refetchInbox();
      void refetchSent();
      void refetchOwnKey();
    }
  }, [receipt.isSuccess, refetchInbox, refetchOwnKey, refetchSent]);

  async function handleRegisterKey() {
    if (!address || !isCorrectChain || !isArcanumMessengerConfigured) {
      return;
    }

    setFlowError('');
    setNoticeTone('pending');
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
      setLastTxHash(hash);
      setStatus('Anahtar kayıt işlemi zincirde bekliyor...');
    } catch (error) {
      setNoticeTone('error');
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
      setNoticeTone('error');
      setFlowError('Alıcının şifreleme anahtarı yok. Alıcı önce Arcanum’a kayıt olmalı.');
      return;
    }

    setFlowError('');
    setNoticeTone('pending');
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
      setLastTxHash(hash);
      setStatus('İşlem zincirde bekliyor...');
    } catch (error) {
      setNoticeTone('error');
      setFlowError(error instanceof Error ? error.message : 'Mesaj gönderilemedi.');
      setStatus('');
    }
  }

  const visibleMessages = (tab === 'inbox' ? inboxMessages : sentMessages) as ChainMessage[] | undefined;
  const isFetchingMessages = tab === 'inbox' ? isInboxFetching : isSentFetching;
  const latestTxUrl = lastTxHash ? transactionUrl(lastTxHash) : undefined;
  const privateRecipientMissing = privacy === 'private' && recipientIsValid && !recipientEncryptionKey;
  const errorMessages = [flowError, connectError?.message, switchError?.message, writeError?.message].filter(Boolean) as string[];

  return (
    <section className="mx-auto w-full max-w-6xl">
      <AppHeader
        address={address}
        isConnected={isConnected}
        isCorrectChain={isCorrectChain}
        isConnectPending={isConnectPending}
        isSwitchPending={isSwitchPending}
        connectorReady={Boolean(injectedConnector)}
        onConnect={() => injectedConnector && connect({ connector: injectedConnector })}
        onDisconnect={() => disconnect()}
        onSwitchChain={() => switchChain({ chainId: arcNetworkTestnet.id })}
      />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <ComposePanel
          recipient={recipient}
          message={message}
          privacy={privacy}
          isConnected={isConnected}
          isCorrectChain={isCorrectChain}
          isWritePending={isWritePending}
          canSend={canSend}
          recipientIsValid={recipientIsValid}
          privateRecipientMissing={privateRecipientMissing}
          ownEncryptionKey={String(ownEncryptionKey ?? '')}
          onRecipientChange={setRecipient}
          onMessageChange={setMessage}
          onPrivacyChange={setPrivacy}
          onRegisterKey={handleRegisterKey}
          onSubmit={handleSendMessage}
        />

        <MessagesPanel
          tab={tab}
          messages={visibleMessages}
          viewer={address}
          isConnected={isConnected}
          isFetching={isFetchingMessages}
          onTabChange={setTab}
          onRefresh={() => (tab === 'inbox' ? refetchInbox() : refetchSent())}
        />
      </div>

      <TransactionNotice status={status} tone={noticeTone} errors={errorMessages} txUrl={latestTxUrl} />
    </section>
  );
}

function AppHeader({
  address,
  isConnected,
  isCorrectChain,
  isConnectPending,
  isSwitchPending,
  connectorReady,
  onConnect,
  onDisconnect,
  onSwitchChain,
}: {
  address?: `0x${string}`;
  isConnected: boolean;
  isCorrectChain: boolean;
  isConnectPending: boolean;
  isSwitchPending: boolean;
  connectorReady: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchChain: () => void;
}) {
  return (
    <header className="rounded-lg border border-zinc-800 bg-zinc-950/95 px-4 py-3 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight text-white">Arcanum</h1>
            <StatusPill tone="success" icon={<Wifi size={13} aria-hidden="true" />} label="Arc Testnet" />
          </div>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            On-chain mesaj gönder, gizli payloadları tarayıcıda şifrele, Inbox ve Sent akışını zincirden oku.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <StatusPill
            tone={isCorrectChain ? 'success' : 'warning'}
            icon={isCorrectChain ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
            label={isCorrectChain ? 'Network ready' : 'Wrong network'}
          />
          <StatusPill tone="neutral" label={`Contract ${shortenAddress(arcanumMessengerAddress)}`} />
          {isConnected && address ? <StatusPill tone="neutral" icon={<Wallet size={13} aria-hidden="true" />} label={shortenAddress(address)} /> : null}

          {isConnected && !isCorrectChain ? (
            <button type="button" onClick={onSwitchChain} disabled={isSwitchPending} className="btn-primary h-10 px-4">
              {isSwitchPending ? 'Switching...' : 'Arc Network’e geç'}
            </button>
          ) : null}

          {isConnected ? (
            <button type="button" onClick={onDisconnect} className="btn-ghost h-10 px-3" aria-label="Bağlantıyı kes">
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" disabled={!connectorReady || isConnectPending} onClick={onConnect} className="btn-primary h-10 px-4">
              <Wallet size={16} aria-hidden="true" />
              {isConnectPending ? 'Bağlanıyor...' : 'Cüzdanı Bağla'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

function ComposePanel({
  recipient,
  message,
  privacy,
  isConnected,
  isCorrectChain,
  isWritePending,
  canSend,
  recipientIsValid,
  privateRecipientMissing,
  ownEncryptionKey,
  onRecipientChange,
  onMessageChange,
  onPrivacyChange,
  onRegisterKey,
  onSubmit,
}: {
  recipient: string;
  message: string;
  privacy: PrivacyMode;
  isConnected: boolean;
  isCorrectChain: boolean;
  isWritePending: boolean;
  canSend: boolean;
  recipientIsValid: boolean;
  privateRecipientMissing: boolean;
  ownEncryptionKey: string;
  onRecipientChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onPrivacyChange: (value: PrivacyMode) => void;
  onRegisterKey: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasKey = ownEncryptionKey.length > 0;

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Compose</p>
          <h2 className="panel-title">Yeni mesaj</h2>
        </div>
        <EncryptionKeyStatus hasKey={hasKey} canRegister={isConnected && isCorrectChain && !isWritePending} onRegister={onRegisterKey} />
      </div>

      {!isConnected ? <EmptyState tone="neutral" title="Cüzdan bağlı değil" body="Mesaj oluşturmak için önce cüzdanını bağla." /> : null}
      {isConnected && !isCorrectChain ? <EmptyState tone="warning" title="Yanlış ağ" body="Gönderim için Arc Testnet ağına geç." /> : null}

      <form onSubmit={onSubmit} className="mt-4 space-y-4">
        <FieldLabel htmlFor="recipient" label="Alıcı adresi" />
        <input
          id="recipient"
          value={recipient}
          onChange={(event) => onRecipientChange(event.target.value)}
          disabled={!isConnected}
          placeholder="0x..."
          className="input font-mono"
        />
        {recipient && !recipientIsValid ? <p className="helper-warning">Geçerli bir EVM adresi gir.</p> : null}

        <FieldLabel htmlFor="message" label="Mesaj" />
        <textarea
          id="message"
          value={message}
          onChange={(event) => onMessageChange(event.target.value)}
          disabled={!isConnected}
          maxLength={280}
          rows={6}
          placeholder="Mesajını yaz..."
          className="input min-h-36 resize-none py-3 leading-6"
        />
        <p className="text-right text-xs text-zinc-500">{message.length}/280</p>

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-200">Gizlilik</p>
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            <ModeButton active={privacy === 'private'} disabled={!isConnected} icon={<Lock size={16} aria-hidden="true" />} label="Private" onClick={() => onPrivacyChange('private')} />
            <ModeButton active={privacy === 'public'} disabled={!isConnected} icon={<Shield size={16} aria-hidden="true" />} label="Public" onClick={() => onPrivacyChange('public')} />
          </div>
          {privateRecipientMissing ? <p className="helper-warning">Alıcı önce Arcanum’a şifreleme anahtarı kaydetmeli.</p> : null}
        </div>

        <button type="submit" disabled={!canSend || privateRecipientMissing} className="btn-primary h-12 w-full">
          <Send size={18} aria-hidden="true" />
          {isWritePending ? 'Wallet confirmation...' : 'Zincire gönder'}
        </button>
      </form>
    </section>
  );
}

function EncryptionKeyStatus({ hasKey, canRegister, onRegister }: { hasKey: boolean; canRegister: boolean; onRegister: () => void }) {
  return (
    <div className="flex flex-col items-end gap-2 sm:flex-row sm:items-center">
      <StatusPill
        tone={hasKey ? 'success' : 'warning'}
        icon={<KeyRound size={13} aria-hidden="true" />}
        label={hasKey ? 'Key registered' : 'Key required'}
      />
      {!hasKey ? (
        <button type="button" disabled={!canRegister} onClick={onRegister} className="btn-ghost h-9 px-3 text-xs">
          Register key
        </button>
      ) : null}
    </div>
  );
}

function MessagesPanel({
  tab,
  messages,
  viewer,
  isConnected,
  isFetching,
  onTabChange,
  onRefresh,
}: {
  tab: TabMode;
  messages?: ChainMessage[];
  viewer?: `0x${string}`;
  isConnected: boolean;
  isFetching: boolean;
  onTabChange: (tab: TabMode) => void;
  onRefresh: () => void;
}) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Messages</p>
          <h2 className="panel-title">Inbox / Sent</h2>
        </div>
        <button type="button" disabled={!isConnected || isFetching} onClick={onRefresh} className="btn-ghost h-10 w-10" aria-label="Mesajları yenile">
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        <TabButton active={tab === 'inbox'} icon={<Inbox size={16} aria-hidden="true" />} label="Inbox" onClick={() => onTabChange('inbox')} />
        <TabButton active={tab === 'sent'} icon={<Send size={16} aria-hidden="true" />} label="Sent" onClick={() => onTabChange('sent')} />
      </div>

      <div className="mt-4 space-y-3">
        {!isConnected ? <EmptyState tone="neutral" title="Cüzdan bağlı değil" body="Inbox ve Sent mesajlarını görmek için cüzdanını bağla." /> : null}
        {isConnected && messages?.length === 0 ? <EmptyState tone="neutral" title="Mesaj yok" body={`${tab === 'inbox' ? 'Inbox' : 'Sent'} akışı şu an boş.`} /> : null}
        {messages?.map((chainMessage) => (
          <MessageCard key={`${tab}-${chainMessage.id.toString()}`} message={chainMessage} viewer={viewer} mode={tab} />
        ))}
      </div>
    </section>
  );
}

function TransactionNotice({ status, tone, errors, txUrl }: { status: string; tone: NoticeTone; errors: string[]; txUrl?: string }) {
  if (!status && errors.length === 0 && !txUrl) {
    return null;
  }

  const isError = tone === 'error' || errors.length > 0;
  const isSuccess = tone === 'success';

  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${isError ? 'border-red-400/30 bg-red-400/10 text-red-200' : isSuccess ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {isError ? <AlertTriangle size={16} aria-hidden="true" /> : isSuccess ? <CheckCircle2 size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
          <p className="min-w-0 break-words">{errors[0] ?? status}</p>
        </div>
        {txUrl ? (
          <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-current underline-offset-4 hover:underline">
            Explorer
            <ExternalLink size={14} aria-hidden="true" />
          </a>
        ) : null}
      </div>
      {errors.slice(1).map((error) => (
        <p key={error} className="mt-2 break-words text-red-200/90">
          {error}
        </p>
      ))}
    </div>
  );
}

function MessageCard({ message, viewer, mode }: { message: ChainMessage; viewer?: `0x${string}`; mode: TabMode }) {
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
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-lg shadow-black/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          tone={message.isPrivate ? 'success' : 'info'}
          icon={message.isPrivate ? <Lock size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
          label={message.isPrivate ? 'Private' : 'Public'}
        />
        <span className="font-mono text-xs text-zinc-500">#{message.id.toString()}</span>
      </div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{body}</p>
      {decryptError ? <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">{decryptError}</p> : null}
      <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <AddressMeta label="From" value={message.sender} />
        <AddressMeta label="To" value={message.recipient} />
        <div className="sm:col-span-2">
          <span className="text-zinc-600">Time </span>
          <span>{formatTimestamp(message.timestamp)}</span>
        </div>
      </div>
    </article>
  );
}

function AddressMeta({ label, value }: { label: string; value: `0x${string}` }) {
  return (
    <div className="min-w-0">
      <span className="text-zinc-600">{label} </span>
      <span className="font-mono text-zinc-400">{shortenAddress(value)}</span>
    </div>
  );
}

function EmptyState({ tone, title, body }: { tone: 'neutral' | 'warning'; title: string; body: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 ${tone === 'warning' ? 'border-amber-300/25 bg-amber-300/10' : 'border-zinc-800 bg-zinc-950'}`}>
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function FieldLabel({ htmlFor, label }: { htmlFor: string; label: string }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-zinc-200">
      {label}
    </label>
  );
}

function ModeButton({ active, disabled, icon, label, onClick }: { active: boolean; disabled: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-11 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}>
      {icon}
      {label}
    </button>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${active ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ tone, icon, label }: { tone: 'neutral' | 'success' | 'warning' | 'info'; icon?: React.ReactNode; label: string }) {
  const toneClass = {
    neutral: 'border-zinc-700 bg-zinc-900 text-zinc-300',
    success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    warning: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
    info: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
  }[tone];

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      {icon}
      <span className="truncate">{label}</span>
    </span>
  );
}
