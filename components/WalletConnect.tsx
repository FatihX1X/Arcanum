'use client';

import dynamic from 'next/dynamic';
import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileKey2,
  HelpCircle,
  Info,
  KeyRound,
  Lock,
  RefreshCw,
  Search,
  Send,
  Shield,
  Upload,
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
import { bridgeChainById } from '../lib/bridgeChains';
import {
  arcanumMessengerAbi,
  arcanumMessengerAddress,
  isArcanumMessengerConfigured,
  messageFeeLabel,
  privateMessageFee,
  publicMessageFee,
  type ChainMessage,
} from '../lib/contract';
import {
  decryptMessage,
  encryptMessage,
  ensureEncryptionKeyPair,
  exportEncryptionKey,
  hasStoredEncryptionKey,
  importEncryptionKey,
  isEncryptionKeyUnlocked,
  assertPrivatePayloadV3,
  unlockEncryptionKey,
} from '../lib/crypto';
import AgentMessages from './AgentMessages';
import BulkSender from './BulkSender';
import GroupMessages from './GroupMessages';
import ArcanumEscrow from './ArcanumEscrow';
import {
  AppFooter as ShellFooter,
  AppHeader as ShellHeader,
  AppSidebar as ShellSidebar,
  type AppView,
  type ThemeMode,
} from './AppChrome';
import { copy, type Language } from './arcanumCopy';
import { Badge, EmptyState, Modal, cx } from './ui';
import BridgeErrorBoundary from './BridgeErrorBoundary';

const CircleSwap = dynamic(() => import('./CircleSwap'), {
  ssr: false,
  loading: () => (
    <section className="panel flex min-h-[680px] items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-emerald-300" />
    </section>
  ),
});

const CircleBridge = dynamic(() => import('./CircleBridge'), {
  ssr: false,
  loading: () => (
    <section className="panel flex min-h-[680px] items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-emerald-300" />
    </section>
  ),
});

const ArcanumHistory = dynamic(() => import('./ArcanumHistory'), {
  ssr: false,
  loading: () => (
    <section className="panel flex min-h-[680px] items-center justify-center">
      <RefreshCw size={20} className="text-accent animate-spin" />
    </section>
  ),
});

type PrivacyMode = 'private' | 'public';
type KeyModalMode = 'unlock' | 'register' | 'export' | 'import' | null;
type TransactionStep = 'idle' | 'preparing' | 'wallet' | 'pending' | 'success' | 'error';
type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};
type ProviderError = {
  code?: number;
  message?: string;
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
      if (message.timestamp > existing.latest.timestamp || (message.timestamp === existing.latest.timestamp && message.id > existing.latest.id)) {
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

function readableError(error: unknown, t: (typeof copy)[Language]) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  if (normalized.includes('reject') || normalized.includes('denied') || normalized.includes('user rejected')) {
    return t.status.rejected;
  }

  if (normalized.includes('insufficient') || normalized.includes('funds') || normalized.includes('exceeds balance')) {
    return t.status.insufficient;
  }

  return message || t.status.failed;
}

function previewFor(message: ChainMessage, t: (typeof copy)[Language]) {
  if (message.isPrivate) {
    return t.dm.noPreview;
  }

  return message.payload.length > 80 ? `${message.payload.slice(0, 80)}...` : message.payload;
}

export default function WalletConnect() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, error: connectError, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitchPending, error: switchError } = useSwitchChain();
  const { writeContractAsync, isPending: isWritePending, error: writeError } = useWriteContract();

  const [language, setLanguageState] = useState<Language>('en');
  const [theme, setThemeState] = useState<ThemeMode>('dark');
  const [view, setView] = useState<AppView>('dm');
  const [menuOpen, setMenuOpen] = useState(false);
  const [newRecipient, setNewRecipient] = useState('');
  const [selected, setSelected] = useState<`0x${string}` | ''>('');
  const [conversationSearch, setConversationSearch] = useState('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [status, setStatus] = useState('');
  const [txStep, setTxStep] = useState<TransactionStep>('idle');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const [pendingRecipient, setPendingRecipient] = useState<`0x${string}` | ''>('');
  const [autoSwitchedFor, setAutoSwitchedFor] = useState('');
  const [localKeyStored, setLocalKeyStored] = useState(false);
  const [localKeyUnlocked, setLocalKeyUnlocked] = useState(false);
  const [keyModalMode, setKeyModalMode] = useState<KeyModalMode>(null);
  const [keyModalPassphrase, setKeyModalPassphrase] = useState('');
  const [keyModalFile, setKeyModalFile] = useState<File | null>(null);
  const [keyActionPending, setKeyActionPending] = useState(false);

  const t = copy[language];
  const connector = connectors.find((item) => item.id === 'injected') ?? connectors[0];
  const connectedAddress = address ?? zeroAddress;
  const isCorrectChain = chainId === arcNetworkTestnet.id;
  const activeRecipient = selected || newRecipient.trim();
  const recipientValid = isAddress(activeRecipient);
  const recipientSelf = Boolean(address && recipientValid && activeRecipient.toLowerCase() === address.toLowerCase());
  const trimmedMessage = message.trim();
  const messageReadsEnabled = view === 'dm';

  const { data: ownKey, refetch: refetchOwnKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [connectedAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumMessengerConfigured },
  });

  const { data: recipientKey } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'encryptionKeys',
    args: [recipientValid ? (activeRecipient as `0x${string}`) : zeroAddress],
    query: { enabled: messageReadsEnabled && isConnected && isCorrectChain && isArcanumMessengerConfigured && privacy === 'private' && recipientValid },
  });

  const { data: inboxMessages, refetch: refetchInbox, isFetching: inboxFetching } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getInbox',
    args: [connectedAddress],
    query: { enabled: messageReadsEnabled && isConnected && isCorrectChain && isArcanumMessengerConfigured },
  });

  const { data: sentMessages, refetch: refetchSent, isFetching: sentFetching } = useReadContract({
    address: arcanumMessengerAddress,
    abi: arcanumMessengerAbi,
    functionName: 'getOutbox',
    args: [connectedAddress],
    query: { enabled: messageReadsEnabled && isConnected && isCorrectChain && isArcanumMessengerConfigured },
  });

  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, query: { enabled: Boolean(pendingHash) } });
  const inbox = useMemo(() => [...(((inboxMessages ?? []) as ChainMessage[]))].sort(byTimeAsc).reverse(), [inboxMessages]);
  const sent = useMemo(() => [...(((sentMessages ?? []) as ChainMessage[]))].sort(byTimeAsc).reverse(), [sentMessages]);
  const allMessages = useMemo(() => [...inbox, ...sent], [inbox, sent]);
  const conversations = useMemo(() => conversationsFor(allMessages, address), [allMessages, address]);
  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) => conversation.address.toLowerCase().includes(query));
  }, [conversationSearch, conversations]);
  const activeConversation = conversations.find((conversation) => conversation.address.toLowerCase() === activeRecipient.toLowerCase());
  const activeMessages = activeConversation?.messages ?? [];
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
  const activeHash = lastHash ?? pendingHash;
  const txUrl = activeHash ? transactionUrl(activeHash) : undefined;
  const errors = [flowError, connectError?.message, switchError?.message, writeError?.message, receipt.error?.message].filter(Boolean) as string[];

  const refreshLocalKeyStatus = useCallback(() => {
    if (!address) {
      setLocalKeyStored(false);
      setLocalKeyUnlocked(false);
      return;
    }

    setLocalKeyStored(hasStoredEncryptionKey(address));
    setLocalKeyUnlocked(isEncryptionKeyUnlocked(address));
  }, [address]);

  const switchToArc = useCallback(async () => {
    setFlowError('');
    const params = arcAddEthereumChainParams();
    const provider = (window as Window & { ethereum?: EthereumProvider }).ethereum;

    try {
      if (!provider) {
        await switchChainAsync({ chainId: arcNetworkTestnet.id });
        return;
      }

      try {
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] });
        return;
      } catch (error) {
        const walletError = error as ProviderError;
        const message = walletError.message?.toLowerCase() ?? '';
        const unknownChain =
          walletError.code === 4902 ||
          message.includes('unrecognized') ||
          message.includes('unknown chain') ||
          message.includes('not added') ||
          message.includes('does not exist');

        if (!unknownChain) {
          throw error;
        }

        await provider.request({ method: 'wallet_addEthereumChain', params: [params] });
        await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: params.chainId }] });
      }
    } catch (error) {
      try {
        await switchChainAsync({ chainId: arcNetworkTestnet.id });
      } catch {
        setTxStep('error');
        setStatus(t.status.switchRejected);
        setFlowError(readableError(error, t) || t.status.switchRejected);
      }
    }
  }, [switchChainAsync, t]);

  useEffect(() => {
    const stored = localStorage.getItem('arcanum.language');
    if (stored === 'en' || stored === 'tr') {
      setLanguageState(stored);
    }
  }, []);

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  useEffect(() => {
    refreshLocalKeyStatus();
  }, [refreshLocalKeyStatus]);

  useEffect(() => {
    if (!isConnected || !address || isCorrectChain || view === 'bridge' || autoSwitchedFor === address) {
      return;
    }

    setAutoSwitchedFor(address);
    void switchToArc();
  }, [address, autoSwitchedFor, isConnected, isCorrectChain, switchToArc, view]);

  useEffect(() => {
    if (!receipt.isSuccess) {
      return;
    }

    setStatus(t.status.success);
    setTxStep('success');
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

  useEffect(() => {
    if (!receipt.isError || !receipt.error) {
      return;
    }

    setTxStep('error');
    setStatus(t.status.failed);
    setFlowError(readableError(receipt.error, t));
  }, [receipt.error, receipt.isError, t]);

  function setLanguage(next: Language) {
    setLanguageState(next);
    localStorage.setItem('arcanum.language', next);
  }

  function setTheme(next: ThemeMode) {
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    localStorage.setItem('arcanum.theme', next);
    setThemeState(next);
  }

  function chooseView(next: AppView) {
    setView(next);
    setMenuOpen(false);
  }

  function replyTo(addressToOpen: `0x${string}`) {
    setSelected(addressToOpen);
    setNewRecipient('');
    setView('dm');
    setMenuOpen(false);
  }

  function openKeyModal(mode: Exclude<KeyModalMode, null>) {
    setKeyModalMode(mode);
    setKeyModalPassphrase('');
    setKeyModalFile(null);
    setFlowError('');
  }

  function closeKeyModal() {
    if (keyActionPending) {
      return;
    }

    setKeyModalMode(null);
    setKeyModalPassphrase('');
    setKeyModalFile(null);
  }

  async function refreshMessages() {
    if (!isConnected || !isCorrectChain) {
      return;
    }

    await Promise.all([refetchInbox(), refetchSent()]);
  }

  async function runKeyModalAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!address || !keyModalMode || !keyModalPassphrase || keyActionPending) {
      return;
    }

    if (keyModalMode === 'import' && !keyModalFile) {
      setFlowError(t.key.file);
      return;
    }

    setKeyActionPending(true);
    setFlowError('');

    try {
      if (keyModalMode === 'unlock') {
        await unlockEncryptionKey(address, keyModalPassphrase);
        refreshLocalKeyStatus();
        setTxStep('success');
        setStatus(t.status.unlocked);
      }

      if (keyModalMode === 'register') {
        setTxStep('preparing');
        setStatus(t.status.preparingKey);
        const keys = await ensureEncryptionKeyPair(address, keyModalPassphrase);
        refreshLocalKeyStatus();
        setTxStep('wallet');
        setStatus(t.status.wallet);
        const hash = await writeContractAsync({
          address: arcanumMessengerAddress,
          abi: arcanumMessengerAbi,
          functionName: 'registerEncryptionKey',
          args: [keys.publicKey],
        });
        setPendingHash(hash);
        setLastHash(hash);
        setTxStep('pending');
        setStatus(t.status.keyPending);
      }

      if (keyModalMode === 'export') {
        const backup = await exportEncryptionKey(address, keyModalPassphrase);
        const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `arcanum-key-${short(address)}.json`;
        link.click();
        URL.revokeObjectURL(url);
        refreshLocalKeyStatus();
        setTxStep('success');
        setStatus(t.status.exported);
      }

      if (keyModalMode === 'import' && keyModalFile) {
        const imported = await importEncryptionKey(address, await keyModalFile.text(), keyModalPassphrase);
        const latestOwnKey = await refetchOwnKey();
        const chainKey = String(latestOwnKey.data ?? ownKey ?? '');
        const matchesOnChain = !chainKey || chainKey === imported.publicKey;
        refreshLocalKeyStatus();
        setTxStep(matchesOnChain ? 'success' : 'error');
        setStatus(matchesOnChain ? t.status.imported : t.status.mismatch);
        setFlowError(matchesOnChain ? '' : t.status.mismatch);
      }

      setKeyModalMode(null);
      setKeyModalPassphrase('');
      setKeyModalFile(null);
    } catch (error) {
      setTxStep('error');
      setStatus(
        keyModalMode === 'register'
          ? t.status.keyFailed
          : keyModalMode === 'unlock'
            ? t.status.unlockFailed
            : t.status.backupFailed,
      );
      setFlowError(readableError(error, t));
    } finally {
      setKeyActionPending(false);
    }
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSend || privateRecipientMissing) {
      setTxStep('error');
      setStatus(privateRecipientMissing ? t.status.missingKey : t.status.failed);
      setFlowError(privateRecipientMissing ? t.status.missingKey : t.status.failed);
      return;
    }

    if (privacy === 'private') {
      if (!hasOwnKey) {
        setTxStep('error');
        setStatus(t.key.needed);
        setFlowError(t.key.centerBody);
        openKeyModal('register');
        return;
      }

      if (address && !hasStoredEncryptionKey(address)) {
        setTxStep('error');
        setStatus(t.key.noLocal);
        setFlowError(t.dm.keyRequired);
        openKeyModal('import');
        return;
      }

      if (address && !isEncryptionKeyUnlocked(address)) {
        setTxStep('error');
        setStatus(t.key.locked);
        setFlowError(t.dm.keyRequired);
        openKeyModal('unlock');
        return;
      }
    }

    try {
      setTxStep('preparing');
      setFlowError('');
      setStatus(privacy === 'private' ? t.status.encrypting : t.status.preparingMessage);
      const payload =
        privacy === 'private'
          ? await encryptMessage(
              trimmedMessage,
              String(recipientKey),
              address as `0x${string}`,
              activeRecipient as `0x${string}`,
              { chainId: arcNetworkTestnet.id, contractAddress: arcanumMessengerAddress },
            )
          : trimmedMessage;
      if (privacy === 'private') {
        await assertPrivatePayloadV3(payload, {
          chainId: arcNetworkTestnet.id,
          contractAddress: arcanumMessengerAddress,
          senderAddress: address as `0x${string}`,
          recipientAddress: activeRecipient as `0x${string}`,
          recipientPublicKey: String(recipientKey),
        });
      }
      refreshLocalKeyStatus();
      setTxStep('wallet');
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
      setTxStep('pending');
      setStatus(t.status.pending);
    } catch (error) {
      setTxStep('error');
      setStatus(t.status.failed);
      setFlowError(readableError(error, t));
    }
  }

  return (
    <div className="app-shell">
      <ShellHeader
        t={t}
        language={language}
        isConnected={isConnected}
        address={address}
        isCorrectChain={view === 'bridge' ? bridgeChainById.has(chainId) : isCorrectChain}
        networkLabel={view === 'bridge' ? bridgeChainById.get(chainId)?.name : 'Arc Testnet'}
        isConnectPending={isConnectPending}
        isSwitchPending={isSwitchPending}
        menuOpen={menuOpen}
        connectorReady={Boolean(connector)}
        onMenu={() => setMenuOpen((open) => !open)}
        onLanguage={() => setLanguage(language === 'en' ? 'tr' : 'en')}
        onConnect={() => connector && connect({ connector })}
        onDisconnect={() => disconnect()}
        onSwitch={() => void switchToArc()}
      />

      {menuOpen ? (
        <div className="mobile-sidebar-layer lg:hidden">
          <ShellSidebar
            t={t}
            language={language}
            view={view}
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            address={address}
            messageCount={allMessages.length}
            hasOwnKey={hasOwnKey}
            hasLocalKey={localKeyStored}
            localUnlocked={localKeyUnlocked}
            theme={theme}
            onView={chooseView}
            onKeyCenter={() => openKeyModal(hasOwnKey ? (localKeyStored ? 'unlock' : 'import') : 'register')}
            onTheme={setTheme}
          />
        </div>
      ) : null}

      <TransactionTimeline t={t} step={txStep} status={status} errors={errors} txUrl={txUrl} />

      {!isArcanumMessengerConfigured ? <Empty title={t.common.unavailable} body={arcanumMessengerAddress} /> : null}

      <div className="app-workspace">
        <div className="hidden lg:block">
          <ShellSidebar
            t={t}
            language={language}
            view={view}
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            address={address}
            messageCount={allMessages.length}
            hasOwnKey={hasOwnKey}
            hasLocalKey={localKeyStored}
            localUnlocked={localKeyUnlocked}
            theme={theme}
            onView={chooseView}
            onKeyCenter={() => openKeyModal(hasOwnKey ? (localKeyStored ? 'unlock' : 'import') : 'register')}
            onTheme={setTheme}
          />
        </div>

        {view === 'dm' ? (
          <DirectMessagesView
            t={t}
            language={language}
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            address={address}
            conversations={filteredConversations}
            allConversationCount={conversations.length}
            activeRecipient={activeRecipient}
            recipientValid={recipientValid}
            recipientSelf={recipientSelf}
            activeMessages={activeMessages}
            conversationSearch={conversationSearch}
            newRecipient={newRecipient}
            privacy={privacy}
            message={message}
            isWritePending={isWritePending}
            canSend={canSend && !privateRecipientMissing}
            privateRecipientMissing={privateRecipientMissing}
            inboxFetching={inboxFetching}
            sentFetching={sentFetching}
            hasOwnKey={hasOwnKey}
            hasLocalKey={localKeyStored}
            localUnlocked={localKeyUnlocked}
            recipientHasKey={Boolean(recipientKey)}
            pendingRecipient={pendingRecipient}
            pendingHash={pendingHash}
            onSearch={setConversationSearch}
            onRecipient={(value) => {
              setNewRecipient(value);
              setSelected('');
            }}
            onSelect={replyTo}
            onRefresh={() => void refreshMessages()}
            onMessage={setMessage}
            onPrivacy={setPrivacy}
            onSubmit={sendMessage}
            onKeyModal={openKeyModal}
          />
        ) : null}

        {view === 'agents' ? <AgentMessages language={language} /> : null}

        {view === 'groups' ? <GroupMessages language={language} /> : null}

        {view === 'bulk' ? <BulkSender language={language} /> : null}

        {view === 'swap' ? <CircleSwap language={language} /> : null}

        {view === 'bridge' ? (
          <BridgeErrorBoundary language={language}>
            <CircleBridge language={language} />
          </BridgeErrorBoundary>
        ) : null}

        {view === 'escrow' ? <ArcanumEscrow language={language} onOpenKeyCenter={() => openKeyModal(hasOwnKey ? (localKeyStored ? 'unlock' : 'import') : 'register')} /> : null}

        {view === 'history' ? <ArcanumHistory language={language} /> : null}

        {view === 'about' ? <InfoPanel title={t.nav.about} eyebrow="Protocol" items={t.about} icon={<Info size={14} />} /> : null}
        {view === 'faq' ? <FaqPanel title={t.nav.faq} items={t.faq} /> : null}
      </div>

      <KeyCenterModal
        t={t}
        mode={keyModalMode}
        passphrase={keyModalPassphrase}
        file={keyModalFile}
        hasOwnKey={hasOwnKey}
        hasLocalKey={localKeyStored}
        localUnlocked={localKeyUnlocked}
        pending={keyActionPending || isWritePending}
        onClose={closeKeyModal}
        onPassphrase={setKeyModalPassphrase}
        onFile={setKeyModalFile}
        onMode={openKeyModal}
        onSubmit={runKeyModalAction}
      />

      <ShellFooter />
    </div>
  );
}

function DirectMessagesView({
  t,
  language,
  isConnected,
  isCorrectChain,
  address,
  conversations,
  allConversationCount,
  activeRecipient,
  recipientValid,
  recipientSelf,
  activeMessages,
  conversationSearch,
  newRecipient,
  privacy,
  message,
  isWritePending,
  canSend,
  privateRecipientMissing,
  inboxFetching,
  sentFetching,
  hasOwnKey,
  hasLocalKey,
  localUnlocked,
  recipientHasKey,
  pendingRecipient,
  pendingHash,
  onSearch,
  onRecipient,
  onSelect,
  onRefresh,
  onMessage,
  onPrivacy,
  onSubmit,
  onKeyModal,
}: {
  t: (typeof copy)[Language];
  language: Language;
  isConnected: boolean;
  isCorrectChain: boolean;
  address?: `0x${string}`;
  conversations: Conversation[];
  allConversationCount: number;
  activeRecipient: string;
  recipientValid: boolean;
  recipientSelf: boolean;
  activeMessages: ChainMessage[];
  conversationSearch: string;
  newRecipient: string;
  privacy: PrivacyMode;
  message: string;
  isWritePending: boolean;
  canSend: boolean;
  privateRecipientMissing: boolean;
  inboxFetching: boolean;
  sentFetching: boolean;
  hasOwnKey: boolean;
  hasLocalKey: boolean;
  localUnlocked: boolean;
  recipientHasKey: boolean;
  pendingRecipient: `0x${string}` | '';
  pendingHash?: `0x${string}`;
  onSearch: (value: string) => void;
  onRecipient: (value: string) => void;
  onSelect: (address: `0x${string}`) => void;
  onRefresh: () => void;
  onMessage: (value: string) => void;
  onPrivacy: (value: PrivacyMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyModal: (mode: Exclude<KeyModalMode, null>) => void;
}) {
  return (
    <section className="communication-layout">
      <div className={recipientValid ? 'hidden min-w-0 xl:block' : 'min-w-0'}>
        <ConversationList
          t={t}
          language={language}
          isConnected={isConnected}
          isCorrectChain={isCorrectChain}
          conversations={conversations}
          allConversationCount={allConversationCount}
          activeRecipient={activeRecipient}
          search={conversationSearch}
          newRecipient={newRecipient}
          pendingRecipient={pendingRecipient}
          pendingHash={pendingHash}
          isFetching={inboxFetching || sentFetching}
          onSearch={onSearch}
          onRecipient={onRecipient}
          onSelect={onSelect}
          onRefresh={onRefresh}
        />
      </div>

      <div className={!recipientValid ? 'hidden min-w-0 xl:block' : 'min-w-0'}>
        <ChatPanel
          t={t}
          language={language}
          isConnected={isConnected}
          isCorrectChain={isCorrectChain}
          viewer={address}
          activeRecipient={activeRecipient}
          recipientValid={recipientValid}
          recipientSelf={recipientSelf}
          messages={activeMessages}
          privacy={privacy}
          message={message}
          isWritePending={isWritePending}
          canSend={canSend}
          privateRecipientMissing={privateRecipientMissing}
          hasOwnKey={hasOwnKey}
          hasLocalKey={hasLocalKey}
          localUnlocked={localUnlocked}
          recipientHasKey={recipientHasKey}
          onBack={() => onRecipient('')}
          onMessage={onMessage}
          onPrivacy={onPrivacy}
          onSubmit={onSubmit}
          onKeyModal={onKeyModal}
        />
      </div>
    </section>
  );
}

function ConversationList({
  t,
  language,
  isConnected,
  isCorrectChain,
  conversations,
  allConversationCount,
  activeRecipient,
  search,
  newRecipient,
  pendingRecipient,
  pendingHash,
  isFetching,
  onSearch,
  onRecipient,
  onSelect,
  onRefresh,
}: {
  t: (typeof copy)[Language];
  language: Language;
  isConnected: boolean;
  isCorrectChain: boolean;
  conversations: Conversation[];
  allConversationCount: number;
  activeRecipient: string;
  search: string;
  newRecipient: string;
  pendingRecipient: `0x${string}` | '';
  pendingHash?: `0x${string}`;
  isFetching: boolean;
  onSearch: (value: string) => void;
  onRecipient: (value: string) => void;
  onSelect: (address: `0x${string}`) => void;
  onRefresh: () => void;
}) {
  const showEmptySearch = isConnected && isCorrectChain && allConversationCount > 0 && conversations.length === 0;

  return (
    <aside className="panel min-h-[560px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">DM</p>
          <h2 className="panel-title">{t.dm.title}</h2>
        </div>
        <button type="button" onClick={onRefresh} disabled={!isConnected || !isCorrectChain} className="btn-ghost h-10 w-10" aria-label={t.history.refresh}>
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-2">
          <span className="text-xs font-medium text-zinc-500">{t.dm.newChat}</span>
          <input value={newRecipient} onChange={(event) => onRecipient(event.target.value)} disabled={!isConnected || !isCorrectChain} placeholder={t.dm.recipient} className="input" />
        </label>

        <label className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-zinc-600" />
          <input value={search} onChange={(event) => onSearch(event.target.value)} disabled={!isConnected || !isCorrectChain} placeholder={t.dm.search} className="input pl-9" />
        </label>
      </div>

      <div className="mt-4 grid max-h-[520px] gap-2 overflow-y-auto pr-1">
        {!isConnected ? <Empty title={t.common.disconnected} body={t.dm.noWallet} /> : null}
        {isConnected && !isCorrectChain ? <Empty title={t.header.wrong} body={t.header.switch} /> : null}
        {isConnected && isCorrectChain && allConversationCount === 0 ? <Empty title={t.dm.empty} body={t.dm.choose} /> : null}
        {showEmptySearch ? <Empty title={t.common.empty} body={t.dm.search} /> : null}
        {conversations.map((conversation) => (
          <ConversationButton
            key={conversation.address}
            t={t}
            language={language}
            conversation={conversation}
            active={activeRecipient.toLowerCase() === conversation.address.toLowerCase()}
            pending={Boolean(pendingHash && pendingRecipient.toLowerCase() === conversation.address.toLowerCase())}
            onClick={() => onSelect(conversation.address)}
          />
        ))}
      </div>
    </aside>
  );
}

function ConversationButton({
  t,
  language,
  conversation,
  active,
  pending,
  onClick,
}: {
  t: (typeof copy)[Language];
  language: Language;
  conversation: Conversation;
  active: boolean;
  pending: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={`chat-card p-3 text-left ${active ? 'is-active' : ''}`} aria-current={active}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm text-zinc-100">{short(conversation.address)}</p>
          <p className="mt-1 truncate text-xs text-zinc-500">{previewFor(conversation.latest, t)}</p>
        </div>
        <span className="shrink-0 text-[11px] text-zinc-500">{time(conversation.latest.timestamp, language)}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Pill tone={conversation.latest.isPrivate ? 'success' : 'info'} label={conversation.latest.isPrivate ? t.common.private : t.common.public} />
        <span className="rounded-full border border-zinc-800 px-2 py-1 text-[11px] text-zinc-500">#{conversation.latest.id.toString()}</span>
        {pending ? <Pill tone="warning" icon={<Clock3 size={12} />} label={t.dm.pendingHint} /> : null}
      </div>
    </button>
  );
}

function ChatPanel({
  t,
  language,
  isConnected,
  isCorrectChain,
  viewer,
  activeRecipient,
  recipientValid,
  recipientSelf,
  messages,
  privacy,
  message,
  isWritePending,
  canSend,
  privateRecipientMissing,
  hasOwnKey,
  hasLocalKey,
  localUnlocked,
  recipientHasKey,
  onBack,
  onMessage,
  onPrivacy,
  onSubmit,
  onKeyModal,
}: {
  t: (typeof copy)[Language];
  language: Language;
  isConnected: boolean;
  isCorrectChain: boolean;
  viewer?: `0x${string}`;
  activeRecipient: string;
  recipientValid: boolean;
  recipientSelf: boolean;
  messages: ChainMessage[];
  privacy: PrivacyMode;
  message: string;
  isWritePending: boolean;
  canSend: boolean;
  privateRecipientMissing: boolean;
  hasOwnKey: boolean;
  hasLocalKey: boolean;
  localUnlocked: boolean;
  recipientHasKey: boolean;
  onBack: () => void;
  onMessage: (value: string) => void;
  onPrivacy: (value: PrivacyMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onKeyModal: (mode: Exclude<KeyModalMode, null>) => void;
}) {
  const hasValidPeer = recipientValid && !recipientSelf;

  return (
    <section className="panel flex min-h-[680px] min-w-0 flex-col">
      <div className="panel-header">
        <div className="flex min-w-0 items-start gap-2">
          <button type="button" onClick={onBack} className="btn-ghost h-10 w-10 shrink-0 xl:hidden" aria-label={t.history.reply}>
            <ArrowLeft size={17} />
          </button>
          <div className="min-w-0">
          <p className="eyebrow">{t.dm.selected}</p>
          <h2 className="panel-title truncate font-mono">{hasValidPeer ? short(activeRecipient) : t.dm.choose}</h2>
          {hasValidPeer ? <p className="mt-1 break-all text-xs text-zinc-500">{activeRecipient}</p> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill tone={hasOwnKey ? 'success' : 'warning'} icon={<KeyRound size={13} />} label={hasOwnKey ? t.key.ok : t.key.needed} />
          <Pill tone={hasLocalKey && localUnlocked ? 'success' : 'warning'} icon={<Lock size={13} />} label={hasLocalKey ? (localUnlocked ? t.key.localReady : t.key.locked) : t.key.noLocal} />
          {hasValidPeer && privacy === 'private' ? <Pill tone={recipientHasKey ? 'success' : 'warning'} icon={<Shield size={13} />} label={recipientHasKey ? t.key.ok : t.key.needed} /> : null}
          <button
            type="button"
            disabled={!isConnected || !isCorrectChain}
            onClick={() => onKeyModal(hasOwnKey ? (hasLocalKey && !localUnlocked ? 'unlock' : 'export') : 'register')}
            className="btn-ghost h-9 px-3 text-xs"
          >
            <FileKey2 size={14} />
            {t.sidebar.keyCenter}
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-[360px] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        {isConnected && !isCorrectChain ? <Empty title={t.header.wrong} body={t.header.switch} /> : null}
        {isCorrectChain && !hasValidPeer ? <Empty title={t.dm.empty} body={t.dm.choose} /> : null}
        {isCorrectChain && hasValidPeer && messages.length === 0 ? <Empty title={t.dm.newConversation} body={t.dm.choose} /> : null}
        {isCorrectChain && messages.map((item) => (
          <MessageBubble key={item.id.toString()} message={item} viewer={viewer} language={language} t={t} />
        ))}
      </div>

      <ChatComposer
        t={t}
        message={message}
        privacy={privacy}
        canSend={canSend}
        isConnected={isConnected}
        isCorrectChain={isCorrectChain}
        isWritePending={isWritePending}
        recipientValid={recipientValid}
        recipientSelf={recipientSelf}
        privateRecipientMissing={privateRecipientMissing}
        onMessage={onMessage}
        onPrivacy={onPrivacy}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function ChatComposer({
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
      {privacy === 'public' ? <p className="helper-danger">{t.composer.publicWarning}</p> : null}
      <textarea
        value={message}
        onChange={(event) => onMessage(event.target.value)}
        disabled={!isConnected || !isCorrectChain}
        maxLength={280}
        rows={3}
        placeholder={t.composer.placeholder}
        className="input min-h-24 resize-none py-3 leading-6"
      />
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="segmented-control grid-cols-2 xl:w-72">
          <Tab active={privacy === 'private'} icon={<Lock size={16} />} label={t.composer.private} onClick={() => onPrivacy('private')} />
          <Tab active={privacy === 'public'} icon={<Shield size={16} />} label={t.composer.public} onClick={() => onPrivacy('public')} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-xs font-medium text-emerald-200">
            {t.composer.fee}: {privacy === 'private' ? messageFeeLabel.private : messageFeeLabel.public}
          </p>
          <button type="submit" disabled={!canSend} className="btn-primary h-11 px-5">
            <Send size={18} />
            {isWritePending ? t.composer.waiting : t.composer.send}
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1 text-xs text-zinc-500 sm:flex-row sm:items-center sm:justify-between">
        <p>{privacy === 'private' ? t.composer.privateHint : t.composer.publicHint}</p>
        <p>
          {message.length}/280 {t.composer.chars}
        </p>
      </div>
    </form>
  );
}

function TransactionTimeline({
  t,
  step,
  status,
  errors,
  txUrl,
}: {
  t: (typeof copy)[Language];
  step: TransactionStep;
  status: string;
  errors: string[];
  txUrl?: string;
}) {
  if (step === 'idle' && !status && errors.length === 0 && !txUrl) {
    return null;
  }

  const stepOrder: TransactionStep[] = ['preparing', 'wallet', 'pending', 'success'];
  const activeIndex = stepOrder.indexOf(step);
  const isError = step === 'error' || errors.length > 0;
  const message = errors[0] ?? status ?? t.status.idle;

  return (
    <section className={`surface px-4 py-3 ${isError ? 'border-red-400/30' : step === 'success' ? 'border-emerald-400/30' : 'border-amber-300/30'}`}>
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {isError ? <AlertTriangle size={18} className="mt-0.5 text-red-300" /> : step === 'success' ? <CheckCircle2 size={18} className="mt-0.5 text-emerald-300" /> : <Archive size={18} className="mt-0.5 text-amber-200" />}
          <div className="min-w-0">
            <p className="break-words text-sm font-medium text-zinc-100">{message}</p>
            {errors.slice(1).map((error) => (
              <p key={error} className="mt-1 break-words text-xs text-red-200">{error}</p>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {stepOrder.map((item, index) => {
            const complete = step === 'success' || (activeIndex >= 0 && index <= activeIndex);
            return (
              <span key={item} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${complete ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-zinc-800 text-zinc-500'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${complete ? 'bg-emerald-300' : 'bg-zinc-700'}`} />
                {t.status.steps[index]}
              </span>
            );
          })}
          {txUrl ? (
            <a href={txUrl} target="_blank" rel="noreferrer" className="btn-ghost h-8 px-2.5 text-xs">
              {t.status.explorer}
              <ExternalLink size={13} />
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function KeyCenterModal({
  t,
  mode,
  passphrase,
  file,
  hasOwnKey,
  hasLocalKey,
  localUnlocked,
  pending,
  onClose,
  onPassphrase,
  onFile,
  onMode,
  onSubmit,
}: {
  t: (typeof copy)[Language];
  mode: KeyModalMode;
  passphrase: string;
  file: File | null;
  hasOwnKey: boolean;
  hasLocalKey: boolean;
  localUnlocked: boolean;
  pending: boolean;
  onClose: () => void;
  onPassphrase: (value: string) => void;
  onFile: (file: File | null) => void;
  onMode: (mode: Exclude<KeyModalMode, null>) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  if (!mode) {
    return null;
  }

  const content = {
    register: { title: t.key.createTitle, body: t.key.createBody, icon: <KeyRound size={18} /> },
    unlock: { title: t.key.unlockTitle, body: t.key.unlockBody, icon: <Lock size={18} /> },
    export: { title: t.key.exportTitle, body: t.key.exportBody, icon: <Download size={18} /> },
    import: { title: t.key.importTitle, body: t.key.importBody, icon: <Upload size={18} /> },
  }[mode];

  return (
    <Modal label={content.title} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={onSubmit} className="modal-panel">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-emerald-200">
              {content.icon}
              <p className="text-sm font-semibold">{t.key.centerTitle}</p>
            </div>
            <h2 className="mt-3 text-xl font-semibold text-white">{content.title}</h2>
            <p className="mt-2 text-sm leading-6 text-zinc-400">{content.body}</p>
          </div>
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost h-9 w-9" aria-label={t.key.cancel}>
            <X size={16} />
          </button>
        </div>

        <div className="mt-5 grid gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500">{t.key.onChain}</span>
            <Pill tone={hasOwnKey ? 'success' : 'warning'} label={hasOwnKey ? t.key.ok : t.key.needed} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500">{t.key.local}</span>
            <Pill tone={hasLocalKey && localUnlocked ? 'success' : 'warning'} label={hasLocalKey ? (localUnlocked ? t.key.localReady : t.key.locked) : t.key.noLocal} />
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="segmented-control grid-cols-2">
            <Tab active={mode === 'unlock'} icon={<Lock size={15} />} label={t.key.unlock} onClick={() => onMode('unlock')} />
            <Tab active={mode === 'register'} icon={<KeyRound size={15} />} label={t.key.register} onClick={() => onMode('register')} />
            <Tab active={mode === 'export'} icon={<Download size={15} />} label={t.key.export} onClick={() => onMode('export')} />
            <Tab active={mode === 'import'} icon={<Upload size={15} />} label={t.key.import} onClick={() => onMode('import')} />
          </div>

          {mode === 'import' ? (
            <label className="grid gap-2">
              <span className="text-xs font-medium text-zinc-500">{t.key.file}</span>
              <span className="btn-ghost h-11 cursor-pointer px-3">
                <Upload size={15} />
                {file ? `${t.key.selectedFile}: ${file.name}` : t.key.chooseFile}
                <input type="file" accept="application/json,.json" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => onFile(event.target.files?.[0] ?? null)} />
              </span>
            </label>
          ) : null}

          <label className="grid gap-2">
            <span className="text-xs font-medium text-zinc-500">{t.key.passphrase}</span>
            <input
              type="password"
              value={passphrase}
              onChange={(event) => onPassphrase(event.target.value)}
              disabled={pending}
              className="input"
              autoComplete="current-password"
              required
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} disabled={pending} className="btn-ghost h-10 px-4">
            {t.key.cancel}
          </button>
          <button type="submit" disabled={pending || !passphrase || (mode === 'import' && !file)} className="btn-primary h-10 px-4">
            {pending ? t.composer.waiting : t.key.confirm}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function MessageBubble({ message, viewer, language, t }: { message: ChainMessage; viewer?: `0x${string}`; language: Language; t: (typeof copy)[Language] }) {
  const outgoing = viewer ? message.sender.toLowerCase() === viewer.toLowerCase() : false;
  return (
    <article className={`message-bubble max-w-[88%] rounded-lg border px-3 py-2 ${outgoing ? 'message-bubble-outgoing ml-auto border-emerald-400/25 bg-emerald-400/10' : 'mr-auto border-zinc-800 bg-zinc-900'}`}>
      <MessageText message={message} viewer={viewer} t={t} />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-zinc-500">
        <Pill tone={message.isPrivate ? 'success' : 'info'} label={message.isPrivate ? t.common.private : t.common.public} />
        <span>{time(message.timestamp, language)}</span>
        <span>#{message.id.toString()}</span>
      </div>
    </article>
  );
}

function MessageText({ message, viewer, t }: { message: ChainMessage; viewer?: `0x${string}`; t: (typeof copy)[Language] }) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [failure, setFailure] = useState<'key' | 'decrypt' | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!message.isPrivate || !viewer) {
        setDecrypted(null);
        setFailure(null);
        return;
      }

      try {
        const value = await decryptMessage(message.payload, viewer);
        if (!cancelled) {
          setDecrypted(value);
          setFailure(null);
        }
      } catch (error) {
        if (!cancelled) {
          const code = error instanceof Error ? error.message : '';
          setDecrypted(null);
          setFailure(['NO_LOCAL_KEY', 'LOCAL_KEY_LOCKED', 'LOCAL_KEY_REQUIRES_MIGRATION'].includes(code) ? 'key' : 'decrypt');
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
      {failure ? (
        <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">
          {failure === 'key' ? t.dm.keyRequired : t.dm.decryptFailed}
        </p>
      ) : null}
    </div>
  );
}

function InfoPanel({ title, eyebrow, items, icon }: { title: string; eyebrow: string; items: readonly string[]; icon: ReactNode }) {
  return (
    <section className="panel min-h-[560px]">
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
    <section className="panel min-h-[560px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Support</p>
          <h2 className="panel-title">{title}</h2>
        </div>
        <Pill tone="info" icon={<HelpCircle size={13} />} label="FAQ" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {items.map(([question, answer]) => (
          <article key={question} className="chat-card p-4">
            <h3 className="text-sm font-semibold text-zinc-100">{question}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return <EmptyState title={title} body={body} />;
}

function Tab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cx('segment-option', active && 'segment-option-active')} aria-pressed={active}>
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function Pill({ tone, icon, label }: { tone: 'success' | 'warning' | 'info'; icon?: ReactNode; label: string }) {
  return <Badge tone={tone} icon={icon}>{label}</Badge>;
}
