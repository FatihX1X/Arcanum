'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  ExternalLink,
  HelpCircle,
  Inbox,
  Info,
  KeyRound,
  Languages,
  Lock,
  Menu,
  MessageCircle,
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
import { arcAddEthereumChainParams, arcNetworkTestnet, transactionUrl } from '../lib/chain';
import {
  arcanumMessengerAbi,
  arcanumMessengerAddress,
  isArcanumMessengerConfigured,
  messageFeeLabel,
  privateMessageFee,
  publicMessageFee,
  type ChainMessage,
} from '../lib/contract';
import { decryptMessage, encryptMessage, ensureEncryptionKeyPair, exportEncryptionKey, importEncryptionKey } from '../lib/crypto';
import { copy, type Language } from './arcanumCopy';

type PrivacyMode = 'private' | 'public';
type ViewMode = 'dm' | 'history' | 'about' | 'faq';
type HistoryTab = 'inbox' | 'sent';
type Tone = 'idle' | 'pending' | 'success' | 'error';
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

type Conversation = {
  address: `0x${string}`;
  messages: ChainMessage[];
  latest: ChainMessage;
};

function short(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function byTimeAsc(a: ChainMessage, b: ChainMessage) {
  if (a.timestamp === b.timestamp) {
    return Number(a.id - b.id);
  }
  return a.timestamp > b.timestamp ? 1 : -1;
}

function time(value: bigint, language: Language) {
  return value === BigInt(0) ? '-' : new Date(Number(value) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US');
}

function conversationsFor(messages: ChainMessage[], viewer?: `0x${string}`) {
  if (!viewer) {
    return [];
  }

  const viewerLower = viewer.toLowerCase();
  const map = new Map<string, Conversation>();

  messages.forEach((message) => {
    const counterparty = message.sender.toLowerCase() === viewerLower ? message.recipient : message.sender;
    const key = counterparty.toLowerCase();
    const existing = map.get(key);

    if (existing) {
      existing.messages.push(message);
      if (message.timestamp > existing.latest.timestamp) {
        existing.latest = message;
      }
    } else {
      map.set(key, { address: counterparty, messages: [message], latest: message });
    }
  });

  return Array.from(map.values())
    .map((conversation) => ({ ...conversation, messages: [...conversation.messages].sort(byTimeAsc) }))
    .sort((a, b) => (a.latest.timestamp > b.latest.timestamp ? -1 : 1));
}

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, error: connectError, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchPending, error: switchError } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending, error: writeError } = useWriteContract();
  const [language, setLanguageState] = useState<Language>('en');
  const [view, setView] = useState<ViewMode>('dm');
  const [menuOpen, setMenuOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [selected, setSelected] = useState<`0x${string}` | ''>('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('inbox');
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState<Tone>('idle');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const [pendingRecipient, setPendingRecipient] = useState<`0x${string}` | ''>('');
  const [autoSwitchedFor, setAutoSwitchedFor] = useState('');

  const t = copy[language];
  const connector = connectors.find((item) => item.id === 'injected') ?? connectors[0];
  const connectedAddress = address ?? zeroAddress;
  const isCorrectChain = chainId === arcNetworkTestnet.id;
  const activeRecipient = selected || newRecipient.trim();
  const recipientValid = isAddress(activeRecipient);
  const recipientSelf = Boolean(address && recipientValid && activeRecipient.toLowerCase() === address.toLowerCase());
  const trimmedMessage = message.trim();

  const { data: ownKey, refetch: refetchOwnKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [connectedAddress],
    query: { enabled: isConnected && isArcanumMessengerConfigured },
  });
  const { data: recipientKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [recipientValid ? (activeRecipient as `0x${string}`) : zeroAddress],
    query: { enabled: isConnected && isArcanumMessengerConfigured && privacy === 'private' && recipientValid },
  });
  const { data: inboxMessages, refetch: refetchInbox, isFetching: inboxFetching } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getInbox',
    args: [connectedAddress],
    query: { enabled: isConnected && isArcanumMessengerConfigured },
  });
  const { data: sentMessages, refetch: refetchSent, isFetching: sentFetching } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getOutbox',
    args: [connectedAddress],
    query: { enabled: isConnected && isArcanumMessengerConfigured },
  });

  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, query: { enabled: Boolean(pendingHash) } });
  const inbox = useMemo(() => [...(((inboxMessages ?? []) as ChainMessage[]))].sort(byTimeAsc).reverse(), [inboxMessages]);
  const sent = useMemo(() => [...(((sentMessages ?? []) as ChainMessage[]))].sort(byTimeAsc).reverse(), [sentMessages]);
  const allMessages = useMemo(() => [...inbox, ...sent], [inbox, sent]);
  const conversations = useMemo(() => conversationsFor(allMessages, address), [allMessages, address]);
  const activeMessages = conversations.find((conversation) => conversation.address.toLowerCase() === activeRecipient.toLowerCase())?.messages ?? [];
  const hasOwnKey = String(ownKey ?? '').length > 0;
  const privateRecipientMissing = privacy === 'private' && recipientValid && !recipientKey;
  const canSend =
    isConnected &&
    isArcanumMessengerConfigured &&
    isCorrectChain &&
    recipientValid &&
    !recipientSelf &&
    trimmedMessage.length > 0 &&
    !isWritePending;

  useEffect(() => {
    const stored = localStorage.getItem('arcanum.language');
    if (stored === 'en' || stored === 'tr') {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address || isCorrectChain || autoSwitchedFor === address) {
      return;
    }
    setAutoSwitchedFor(address);
    void switchToArc();
  }, [address, autoSwitchedFor, isConnected, isCorrectChain]);

  useEffect(() => {
    if (!receipt.isSuccess) {
      return;
    }

    setStatus(t.status.success);
    setTone('success');
    setMessage('');
    setPendingHash(undefined);
    if (pendingRecipient) {
      setSelected(pendingRecipient);
      setNewRecipient('');
      setPendingRecipient('');
    }
    void refetchInbox();
    void refetchSent();
    void refetchOwnKey();
  }, [pendingRecipient, receipt.isSuccess, refetchInbox, refetchOwnKey, refetchSent, t.status.success]);

  function setLanguage(next: Language) {
    setLanguageState(next);
    localStorage.setItem('arcanum.language', next);
  }

  async function switchToArc() {
    setFlowError('');
    try {
      await switchChainAsync({ chainId: arcNetworkTestnet.id });
    } catch {
      try {
        const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;
        await provider?.request({ method: 'wallet_addEthereumChain', params: [arcAddEthereumChainParams()] });
      } catch {
        setTone('error');
        setStatus(t.status.switchRejected);
        setFlowError(t.status.switchRejected);
      }
    }
  }

  async function registerKey() {
    if (!address) {
      return;
    }

    try {
      setTone('pending');
      setStatus(t.status.preparingKey);
      const keys = await ensureEncryptionKeyPair(address);
      setStatus(t.status.wallet);
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'registerEncryptionKey',
        args: [keys.publicKey],
      });
      setPendingHash(hash);
      setLastHash(hash);
      setStatus(t.status.keyPending);
    } catch (error) {
      setTone('error');
      setStatus(t.status.keyFailed);
      setFlowError(error instanceof Error ? error.message : t.status.keyFailed);
    }
  }

  async function exportKey() {
    if (!address) {
      return;
    }

    const passphrase = window.prompt(t.key.exportPrompt);
    if (!passphrase) {
      return;
    }

    try {
      const backup = await exportEncryptionKey(address, passphrase);
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `arcanum-key-${short(address)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setTone('success');
      setStatus(t.status.exported);
      setFlowError('');
    } catch (error) {
      setTone('error');
      setStatus(t.status.backupFailed);
      setFlowError(error instanceof Error ? error.message : t.status.backupFailed);
    }
  }

  async function importKey(file: File) {
    if (!address) {
      return;
    }

    const passphrase = window.prompt(t.key.importPrompt);
    if (!passphrase) {
      return;
    }

    try {
      const imported = await importEncryptionKey(address, await file.text(), passphrase);
      await refetchOwnKey();
      const matchesOnChain = !ownKey || String(ownKey) === imported.publicKey;
      setTone(matchesOnChain ? 'success' : 'error');
      setStatus(matchesOnChain ? t.status.imported : t.status.mismatch);
      setFlowError(matchesOnChain ? '' : t.status.mismatch);
    } catch (error) {
      setTone('error');
      setStatus(t.status.backupFailed);
      setFlowError(error instanceof Error ? error.message : t.status.backupFailed);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend || privateRecipientMissing) {
      setTone('error');
      setStatus(privateRecipientMissing ? t.status.missingKey : t.status.failed);
      setFlowError(privateRecipientMissing ? t.status.missingKey : t.status.failed);
      return;
    }

    try {
      setTone('pending');
      setFlowError('');
      setStatus(privacy === 'private' ? t.status.encrypting : t.status.preparingMessage);
      const payload =
        privacy === 'private' ? await encryptMessage(trimmedMessage, String(recipientKey), address as `0x${string}`) : trimmedMessage;
      setStatus(t.status.wallet);
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'sendMessage',
        args: [activeRecipient as `0x${string}`, payload, privacy === 'private'],
        value: privacy === 'private' ? privateMessageFee : publicMessageFee,
      });
      setPendingRecipient(activeRecipient as `0x${string}`);
      setPendingHash(hash);
      setLastHash(hash);
      setStatus(t.status.pending);
    } catch (error) {
      setTone('error');
      setStatus(t.status.failed);
      setFlowError(error instanceof Error ? error.message : t.status.failed);
    }
  }

  function chooseView(next: ViewMode) {
    setView(next);
    setMenuOpen(false);
  }

  function replyTo(addressToOpen: `0x${string}`) {
    setSelected(addressToOpen);
    setNewRecipient('');
    setView('dm');
    setMenuOpen(false);
  }

  const errors = [flowError, connectError?.message, switchError?.message, writeError?.message, receipt.error?.message].filter(Boolean) as string[];
  const txUrl = transactionUrl(lastHash ?? pendingHash ?? '');

  return (
    <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-7xl flex-col gap-4">
      <header className="rounded-lg border border-zinc-800 bg-black/80 px-4 py-3 shadow-xl shadow-black/25">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setMenuOpen((open) => !open)} className="btn-ghost h-10 w-10" aria-label={t.header.menu}>
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <img src="/arcanum-logo.png" alt="Arcanum logo" className="h-10 w-10 rounded-md object-cover" />
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight">Arcanum</h1>
              <p className="truncate text-xs text-zinc-500">{t.header.tagline}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setLanguage(language === 'en' ? 'tr' : 'en')} className="btn-ghost h-9 px-3 text-xs">
              <Languages size={14} />
              {language.toUpperCase()}
            </button>
            <Pill tone={isCorrectChain ? 'success' : 'warning'} icon={<Wifi size={13} />} label={isCorrectChain ? t.header.ready : t.header.wrong} />
            {!isCorrectChain && isConnected ? (
              <button type="button" onClick={() => void switchToArc()} disabled={isSwitchPending} className="btn-ghost h-9 px-3 text-xs">
                {isSwitchPending ? t.header.switching : t.header.switch}
              </button>
            ) : null}
            <Pill tone="info" label={`${t.header.contract} ${short(arcanumMessengerAddress)}`} />
            {isConnected && address ? (
              <button type="button" onClick={() => disconnect()} className="btn-ghost h-9 px-3 text-xs">
                <Wallet size={14} />
                {short(address)}
              </button>
            ) : (
              <button type="button" onClick={() => connector && connect({ connector })} disabled={!connector || isConnectPending} className="btn-primary h-9 px-3 text-xs">
                <Wallet size={14} />
                {isConnectPending ? t.header.connecting : t.header.connect}
              </button>
            )}
          </div>
        </div>

        {menuOpen ? (
          <nav className="mt-3 grid gap-2 border-t border-zinc-800 pt-3 sm:grid-cols-4">
            {(['dm', 'history', 'about', 'faq'] as ViewMode[]).map((item, index) => (
              <button
                key={item}
                type="button"
                onClick={() => chooseView(item)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  view === item ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-100' : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700'
                }`}
              >
                {t.nav[index]}
              </button>
            ))}
          </nav>
        ) : null}

        <Notice status={status} tone={tone} errors={errors} txUrl={txUrl} explorer={t.status.explorer} />
      </header>

      {!isArcanumMessengerConfigured ? <Empty title={t.common.unavailable} body={arcanumMessengerAddress} /> : null}
      {view === 'dm' ? (
        <section className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="panel min-h-[520px]">
            <div className="panel-header">
              <div>
                <p className="eyebrow">DM</p>
                <h2 className="panel-title">{t.dm.title}</h2>
              </div>
              <button type="button" onClick={() => void Promise.all([refetchInbox(), refetchSent()])} className="btn-ghost h-10 w-10">
                <RefreshCw size={16} className={inboxFetching || sentFetching ? 'animate-spin' : ''} />
              </button>
            </div>
            <label className="mt-4 block text-xs font-medium text-zinc-500">{t.dm.newChat}</label>
            <input
              value={newRecipient}
              onChange={(event) => {
                setNewRecipient(event.target.value);
                setSelected('');
              }}
              placeholder={t.dm.recipient}
              className="input mt-2"
            />
            <div className="mt-4 grid gap-2">
              {!isConnected ? <Empty title={t.common.disconnected} body={t.dm.noWallet} /> : null}
              {isConnected && conversations.length === 0 ? <Empty title={t.dm.empty} body={t.dm.choose} /> : null}
              {conversations.map((conversation) => (
                <button
                  key={conversation.address}
                  type="button"
                  onClick={() => replyTo(conversation.address)}
                  className={`rounded-lg border p-3 text-left ${activeRecipient.toLowerCase() === conversation.address.toLowerCase() ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-mono text-sm">{short(conversation.address)}</span>
                    <span className="shrink-0 text-xs text-zinc-500">{time(conversation.latest.timestamp, language)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                    <Pill tone={conversation.latest.isPrivate ? 'success' : 'info'} label={conversation.latest.isPrivate ? t.common.private : t.common.public} />
                    <span>#{conversation.latest.id.toString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="panel flex min-h-[620px] flex-col">
            <div className="panel-header">
              <div className="min-w-0">
                <p className="eyebrow">{t.dm.title}</p>
                <h2 className="panel-title truncate font-mono">{recipientValid && !recipientSelf ? short(activeRecipient) : t.dm.choose}</h2>
              </div>
              <KeyActions t={t} hasKey={hasOwnKey} disabled={!isConnected || !isCorrectChain || isWritePending} onRegister={registerKey} onExport={exportKey} onImport={importKey} />
            </div>

            <div className="mt-4 flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              {!recipientValid || recipientSelf ? <Empty title={t.dm.empty} body={t.dm.choose} /> : null}
              {recipientValid && !recipientSelf && activeMessages.length === 0 ? <Empty title={t.dm.empty} body={t.dm.choose} /> : null}
              {activeMessages.map((item) => (
                <MessageBubble key={item.id.toString()} message={item} viewer={address} language={language} t={t} />
              ))}
            </div>

            <Composer
              t={t}
              message={message}
              privacy={privacy}
              canSend={canSend && !privateRecipientMissing}
              isConnected={isConnected}
              isCorrectChain={isCorrectChain}
              isWritePending={isWritePending}
              recipientValid={recipientValid}
              recipientSelf={recipientSelf}
              privateRecipientMissing={privateRecipientMissing}
              onMessage={setMessage}
              onPrivacy={setPrivacy}
              onSubmit={sendMessage}
            />
          </section>
        </section>
      ) : null}

      {view === 'history' ? (
        <section className="panel min-h-[620px]">
          <div className="panel-header">
            <div>
              <p className="eyebrow">History</p>
              <h2 className="panel-title">{t.history.title}</h2>
            </div>
            <button type="button" onClick={() => void Promise.all([refetchInbox(), refetchSent()])} disabled={!isConnected} className="btn-ghost h-10 px-3">
              <RefreshCw size={16} className={inboxFetching || sentFetching ? 'animate-spin' : ''} />
              {t.history.refresh}
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
            <Tab active={historyTab === 'inbox'} icon={<Inbox size={16} />} label={t.history.inbox} onClick={() => setHistoryTab('inbox')} />
            <Tab active={historyTab === 'sent'} icon={<Send size={16} />} label={t.history.sent} onClick={() => setHistoryTab('sent')} />
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {!isConnected ? <Empty title={t.common.disconnected} body={t.dm.noWallet} /> : null}
            {isConnected && (historyTab === 'inbox' ? inbox : sent).length === 0 ? <Empty title={t.history.empty} body={t.history.empty} /> : null}
            {(historyTab === 'inbox' ? inbox : sent).map((item) => (
              <MessageCard
                key={`${historyTab}-${item.id.toString()}`}
                message={item}
                viewer={address}
                language={language}
                t={t}
                action={historyTab === 'inbox' ? t.history.reply : t.history.open}
                onAction={() => replyTo(historyTab === 'inbox' ? item.sender : item.recipient)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {view === 'about' ? <InfoPanel title={t.nav[2]} eyebrow="Protocol" items={t.about} icon={<Info size={14} />} /> : null}
      {view === 'faq' ? <FaqPanel title={t.nav[3]} items={t.faq} /> : null}
    </div>
  );
}

function KeyActions({
  t,
  hasKey,
  disabled,
  onRegister,
  onExport,
  onImport,
}: {
  t: (typeof copy)[Language];
  hasKey: boolean;
  disabled: boolean;
  onRegister: () => void;
  onExport: () => void;
  onImport: (file: File) => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <Pill tone={hasKey ? 'success' : 'warning'} icon={<KeyRound size={13} />} label={hasKey ? t.key.ok : t.key.needed} />
      {!hasKey ? (
        <button type="button" disabled={disabled} onClick={onRegister} className="btn-ghost h-9 px-3 text-xs">
          {t.key.register}
        </button>
      ) : (
        <button type="button" disabled={disabled} onClick={onExport} className="btn-ghost h-9 px-3 text-xs">
          {t.key.export}
        </button>
      )}
      <label className={`btn-ghost h-9 px-3 text-xs ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
        {t.key.import}
        <input
          type="file"
          accept="application/json,.json"
          disabled={disabled}
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) {
              onImport(file);
            }
          }}
        />
      </label>
    </div>
  );
}

function Composer({
  t,
  message,
  privacy,
  canSend,
  isConnected,
  isCorrectChain,
  isWritePending,
  recipientValid,
  recipientSelf,
  privateRecipientMissing,
  onMessage,
  onPrivacy,
  onSubmit,
}: {
  t: (typeof copy)[Language];
  message: string;
  privacy: PrivacyMode;
  canSend: boolean;
  isConnected: boolean;
  isCorrectChain: boolean;
  isWritePending: boolean;
  recipientValid: boolean;
  recipientSelf: boolean;
  privateRecipientMissing: boolean;
  onMessage: (value: string) => void;
  onPrivacy: (value: PrivacyMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      {isConnected && !isCorrectChain ? <Empty title={t.header.wrong} body={t.header.switch} /> : null}
      {isConnected && !recipientValid ? <p className="helper-warning">{t.composer.invalid}</p> : null}
      {recipientSelf ? <p className="helper-warning">{t.composer.self}</p> : null}
      {privateRecipientMissing ? <p className="helper-warning">{t.composer.missingKey}</p> : null}
      <textarea value={message} onChange={(event) => onMessage(event.target.value)} disabled={!isConnected} maxLength={280} rows={3} placeholder={t.composer.placeholder} className="input min-h-24 resize-none py-3 leading-6" />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1 xl:w-72">
          <Tab active={privacy === 'private'} icon={<Lock size={16} />} label={t.composer.private} onClick={() => onPrivacy('private')} />
          <Tab active={privacy === 'public'} icon={<Shield size={16} />} label={t.composer.public} onClick={() => onPrivacy('public')} />
        </div>
        <button type="submit" disabled={!canSend} className="btn-primary h-11 px-5">
          <Send size={18} />
          {isWritePending ? t.composer.waiting : t.composer.send}
        </button>
      </div>
      <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{privacy === 'private' ? t.composer.privateHint : t.composer.publicHint}</p>
        <p className="font-medium text-emerald-200">
          {t.composer.fee}: {privacy === 'private' ? messageFeeLabel.private : messageFeeLabel.public}
        </p>
      </div>
    </form>
  );
}

function MessageBubble({ message, viewer, language, t }: { message: ChainMessage; viewer?: `0x${string}`; language: Language; t: (typeof copy)[Language] }) {
  const outgoing = viewer ? message.sender.toLowerCase() === viewer.toLowerCase() : false;
  return (
    <article className={`max-w-[86%] rounded-lg border px-3 py-2 ${outgoing ? 'ml-auto border-emerald-400/25 bg-emerald-400/10' : 'mr-auto border-zinc-800 bg-zinc-900'}`}>
      <MessageText message={message} viewer={viewer} t={t} />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-zinc-500">
        <Pill tone={message.isPrivate ? 'success' : 'info'} label={message.isPrivate ? t.common.private : t.common.public} />
        <span>{time(message.timestamp, language)}</span>
      </div>
    </article>
  );
}

function MessageCard({
  message,
  viewer,
  language,
  t,
  action,
  onAction,
}: {
  message: ChainMessage;
  viewer?: `0x${string}`;
  language: Language;
  t: (typeof copy)[Language];
  action: string;
  onAction: () => void;
}) {
  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <Pill tone={message.isPrivate ? 'success' : 'info'} icon={message.isPrivate ? <Lock size={13} /> : <Shield size={13} />} label={message.isPrivate ? t.common.private : t.common.public} />
        <span className="font-mono text-xs text-zinc-500">#{message.id.toString()}</span>
      </div>
      <MessageText message={message} viewer={viewer} t={t} />
      <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <span>{t.history.from} {short(message.sender)}</span>
        <span>{t.history.to} {short(message.recipient)}</span>
        <span className="sm:col-span-2">{t.history.time} {time(message.timestamp, language)}</span>
      </div>
      <button type="button" onClick={onAction} className="btn-ghost mt-4 h-10 px-3">
        <MessageCircle size={15} />
        {action}
      </button>
    </article>
  );
}

function MessageText({ message, viewer, t }: { message: ChainMessage; viewer?: `0x${string}`; t: (typeof copy)[Language] }) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!message.isPrivate || !viewer) {
        setDecrypted(null);
        setFailed(false);
        return;
      }
      try {
        const value = await decryptMessage(message.payload, viewer);
        if (!cancelled) {
          setDecrypted(value);
          setFailed(false);
        }
      } catch {
        if (!cancelled) {
          setDecrypted(null);
          setFailed(true);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [message.isPrivate, message.payload, viewer]);

  return (
    <div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{message.isPrivate ? decrypted ?? t.dm.encrypted : message.payload}</p>
      {failed ? <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">{t.dm.decryptFailed}</p> : null}
    </div>
  );
}

function InfoPanel({ title, eyebrow, items, icon }: { title: string; eyebrow: string; items: readonly string[]; icon: JSX.Element }) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 className="panel-title">{title}</h2>
        </div>
        <Pill tone="success" icon={icon} label="Arc Testnet" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {items.map((item) => (
          <p key={item} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
            {item}
          </p>
        ))}
      </div>
    </section>
  );
}

function FaqPanel({ title, items }: { title: string; items: readonly (readonly [string, string])[] }) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Support</p>
          <h2 className="panel-title">{title}</h2>
        </div>
        <Pill tone="info" icon={<HelpCircle size={13} />} label="FAQ" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {items.map(([question, answer]) => (
          <article key={question} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">{question}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Notice({ status, tone, errors, txUrl, explorer }: { status: string; tone: Tone; errors: string[]; txUrl?: string; explorer: string }) {
  if (!status && errors.length === 0 && !txUrl) {
    return null;
  }
  const isError = tone === 'error' || errors.length > 0;
  const isSuccess = tone === 'success';
  return (
    <div className={`mt-3 rounded-lg border px-4 py-3 text-sm ${isError ? 'border-red-400/30 bg-red-400/10 text-red-200' : isSuccess ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/30 bg-amber-300/10 text-amber-100'}`}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          {isError ? <AlertTriangle size={16} /> : isSuccess ? <CheckCircle2 size={16} /> : <Archive size={16} />}
          <p className="min-w-0 break-words">{errors[0] ?? status}</p>
        </div>
        {txUrl ? (
          <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-4 hover:underline">
            {explorer}
            <ExternalLink size={14} />
          </a>
        ) : null}
      </div>
      {errors.slice(1).map((error) => (
        <p key={error} className="mt-2 break-words">{error}</p>
      ))}
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
      <p className="text-sm font-medium text-zinc-200">{title}</p>
      <p className="mt-1 break-words text-sm text-zinc-500">{body}</p>
    </div>
  );
}

function Tab({ active, icon, label, onClick }: { active: boolean; icon: JSX.Element; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${active ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}>
      {icon}
      {label}
    </button>
  );
}

function Pill({ tone, icon, label }: { tone: 'success' | 'warning' | 'info'; icon?: JSX.Element; label: string }) {
  const toneClass = {
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
