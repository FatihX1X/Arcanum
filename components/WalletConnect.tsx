'use client';

import { FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Clock3,
  ExternalLink,
  HelpCircle,
  Inbox,
  Info,
  KeyRound,
  Languages,
  Lock,
  Menu,
  MessageCircle,
  PlusCircle,
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
  type ChainMessage,
} from '../lib/contract';
import { decryptMessage, encryptMessage, ensureEncryptionKeyPair } from '../lib/crypto';

type PrivacyMode = 'private' | 'public';
type HistoryTab = 'inbox' | 'sent';
type NoticeTone = 'idle' | 'pending' | 'success' | 'error';
type ViewMode = 'dm' | 'history' | 'about' | 'faq';
type Language = 'en' | 'tr';

type Conversation = {
  address: `0x${string}`;
  messages: ChainMessage[];
  latest: ChainMessage;
};

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

const dictionary = {
  en: {
    nav: {
      directMessages: 'Direct Messages',
      history: 'Inbox / Sent',
      about: 'About Arcanum',
      faq: 'FAQ',
    },
    header: {
      tagline: 'Private on-chain messaging on Arc Testnet.',
      networkReady: 'Network ready',
      wrongNetwork: 'Wrong network',
      switchToArc: 'Switch to Arc',
      switching: 'Switching...',
      connect: 'Connect Wallet',
      connecting: 'Connecting...',
      disconnect: 'Disconnect wallet',
      contract: 'Contract',
      language: 'Language',
      menu: 'Open navigation menu',
      logoAlt: 'Arcanum logo',
    },
    key: {
      registered: 'Key registered',
      required: 'Key required',
      register: 'Register key',
    },
    dm: {
      eyebrow: 'Messaging',
      title: 'Direct Messages',
      newChat: 'New DM address',
      newChatPlaceholder: '0x recipient address',
      noWalletTitle: 'Wallet disconnected',
      noWalletBody: 'Connect your wallet to load conversations.',
      noConversationsTitle: 'No conversations yet',
      noConversationsBody: 'Start with a recipient address and send the first message.',
      selectTitle: 'Select a conversation',
      selectBody: 'Choose a direct message or enter a new recipient address.',
      conversation: 'Conversation',
      messages: 'messages',
      encryptedPayload: 'Encrypted payload is stored on-chain.',
      decryptFailed: 'This private message could not be decrypted with the key on this device.',
    },
    composer: {
      placeholder: 'Write a message...',
      privacy: 'Privacy',
      private: 'Private',
      public: 'Public',
      send: 'Send on-chain',
      waiting: 'Wallet confirmation...',
      invalidRecipient: 'Enter a valid EVM address.',
      selfRecipient: 'You cannot send a message to your own wallet.',
      missingRecipientKey: 'Recipient must register an Arcanum encryption key before private messages can be sent.',
      publicHint: 'Public messages are written to the chain as plaintext.',
      privateHint: 'Private messages are encrypted in the browser before they are written on-chain.',
    },
    history: {
      eyebrow: 'History',
      title: 'Inbox / Sent',
      refresh: 'Refresh messages',
      inbox: 'Inbox',
      sent: 'Sent',
      emptyTitle: 'No messages',
      emptyBody: 'This message stream is empty.',
      disconnectedTitle: 'Wallet disconnected',
      disconnectedBody: 'Connect your wallet to read Inbox and Sent.',
      reply: 'Reply',
      openChat: 'Open chat',
      from: 'From',
      to: 'To',
      time: 'Time',
    },
    about: {
      eyebrow: 'Protocol',
      title: 'About Arcanum',
      body: [
        'Arcanum is a private on-chain messaging dApp running on Arc Testnet.',
        'Public messages are written to the chain as readable plaintext payloads.',
        'Private messages are encrypted in the browser and only ciphertext is stored on-chain.',
        'Encryption keys stay in the user browser. A different device needs the same local key to read older private messages.',
      ],
    },
    faq: {
      eyebrow: 'Support',
      title: 'FAQ',
      items: [
        ['What is Arc Testnet?', 'Arc Testnet is the network where Arcanum currently writes and reads message records.'],
        ['Why do I need to register an encryption key?', 'Private messaging needs the recipient public key on-chain so the browser can encrypt a message before sending it.'],
        ['Where are private messages stored?', 'Only encrypted ciphertext and metadata are stored on-chain. The readable text stays client-side after decryption.'],
        ['Why might I not read old private messages on another device?', 'The private decryption key is stored locally in the browser. Another device needs import/export support to reuse it.'],
        ['Why is the gas token USDC?', 'Arc Testnet uses USDC as its native gas token in the current configuration.'],
        ['Can I delete or edit messages?', 'No. The current contract stores immutable on-chain messages and does not expose delete or edit functions.'],
      ],
    },
    status: {
      keyPreparing: 'Preparing encryption key...',
      walletConfirmation: 'Waiting for wallet confirmation...',
      keyPending: 'Key registration is pending on-chain...',
      keyFailed: 'Key registration failed.',
      encrypting: 'Encrypting message in the browser...',
      preparingMessage: 'Preparing message...',
      txPending: 'Transaction is pending on-chain...',
      txSuccess: 'Transaction confirmed. Message was written on-chain.',
      sendFailed: 'Message could not be sent.',
      addChainRejected: 'Arc Testnet switch was rejected or could not be added.',
      recipientKeyMissing: 'Recipient does not have an encryption key yet. They must register in Arcanum first.',
      explorer: 'Explorer',
    },
    common: {
      arcTestnet: 'Arc Testnet',
      private: 'Private',
      public: 'Public',
      contractUnavailable: 'Contract address is not configured.',
    },
  },
  tr: {
    nav: {
      directMessages: 'Direkt Mesajlar',
      history: 'Inbox / Sent',
      about: 'Arcanum Hakkında',
      faq: 'SSS',
    },
    header: {
      tagline: 'Arc Testnet üzerinde gizli on-chain mesajlaşma.',
      networkReady: 'Ağ hazır',
      wrongNetwork: 'Yanlış ağ',
      switchToArc: 'Arc ağına geç',
      switching: 'Geçiliyor...',
      connect: 'Cüzdanı Bağla',
      connecting: 'Bağlanıyor...',
      disconnect: 'Cüzdan bağlantısını kes',
      contract: 'Kontrat',
      language: 'Dil',
      menu: 'Navigasyon menüsünü aç',
      logoAlt: 'Arcanum logosu',
    },
    key: {
      registered: 'Key registered',
      required: 'Key required',
      register: 'Register key',
    },
    dm: {
      eyebrow: 'Mesajlaşma',
      title: 'Direkt Mesajlar',
      newChat: 'Yeni DM adresi',
      newChatPlaceholder: '0x alıcı adresi',
      noWalletTitle: 'Cüzdan bağlı değil',
      noWalletBody: 'Konuşmaları yüklemek için cüzdanını bağla.',
      noConversationsTitle: 'Henüz konuşma yok',
      noConversationsBody: 'Bir alıcı adresi girip ilk mesajı gönder.',
      selectTitle: 'Bir konuşma seç',
      selectBody: 'Bir direkt mesaj seç veya yeni alıcı adresi gir.',
      conversation: 'Konuşma',
      messages: 'mesaj',
      encryptedPayload: 'Şifreli payload zincirde saklanıyor.',
      decryptFailed: 'Bu gizli mesaj bu cihazdaki anahtarla çözülemedi.',
    },
    composer: {
      placeholder: 'Mesaj yaz...',
      privacy: 'Gizlilik',
      private: 'Private',
      public: 'Public',
      send: 'Zincire gönder',
      waiting: 'Cüzdan onayı bekleniyor...',
      invalidRecipient: 'Geçerli bir EVM adresi gir.',
      selfRecipient: 'Kendi cüzdanına mesaj gönderemezsin.',
      missingRecipientKey: 'Private mesaj göndermek için alıcı önce Arcanum şifreleme anahtarı kaydetmeli.',
      publicHint: 'Public mesajlar zincire plaintext olarak yazılır.',
      privateHint: 'Private mesajlar zincire yazılmadan önce browser içinde şifrelenir.',
    },
    history: {
      eyebrow: 'Geçmiş',
      title: 'Inbox / Sent',
      refresh: 'Mesajları yenile',
      inbox: 'Inbox',
      sent: 'Sent',
      emptyTitle: 'Mesaj yok',
      emptyBody: 'Bu mesaj akışı şu an boş.',
      disconnectedTitle: 'Cüzdan bağlı değil',
      disconnectedBody: 'Inbox ve Sent mesajlarını okumak için cüzdanını bağla.',
      reply: 'Yanıtla',
      openChat: 'Chat aç',
      from: 'From',
      to: 'To',
      time: 'Time',
    },
    about: {
      eyebrow: 'Protokol',
      title: 'Arcanum Hakkında',
      body: [
        'Arcanum, Arc Testnet üzerinde çalışan private on-chain messaging dApp uygulamasıdır.',
        'Public mesajlar zincire okunabilir plaintext payload olarak yazılır.',
        'Private mesajlar browser içinde şifrelenir ve zincirde yalnızca ciphertext saklanır.',
        'Şifreleme anahtarları kullanıcının browserında kalır. Başka cihazda eski private mesajları okumak için aynı yerel anahtar gerekir.',
      ],
    },
    faq: {
      eyebrow: 'Destek',
      title: 'SSS',
      items: [
        ['Arc Testnet nedir?', 'Arcanum mesaj kayıtlarını şu an Arc Testnet üzerinde yazar ve okur.'],
        ['Neden encryption key kaydı gerekiyor?', 'Private mesaj için alıcının public key bilgisi zincirde olmalı ki browser mesajı göndermeden önce şifreleyebilsin.'],
        ['Private mesajlar nerede saklanıyor?', 'Zincirde yalnızca şifreli ciphertext ve metadata saklanır. Okunabilir metin decrypt sonrası client tarafındadır.'],
        ['Başka cihazda eski private mesajları neden okuyamayabilirim?', 'Private decryption key browser local storage içinde tutulur. Başka cihazda aynı anahtar için import/export desteği gerekir.'],
        ['Gas token neden USDC?', 'Arc Testnet mevcut yapılandırmada native gas token olarak USDC kullanır.'],
        ['Mesaj silme veya düzenleme var mı?', 'Hayır. Mevcut kontrat immutable on-chain mesaj saklar ve delete/edit fonksiyonu sunmaz.'],
      ],
    },
    status: {
      keyPreparing: 'Şifreleme anahtarı hazırlanıyor...',
      walletConfirmation: 'Cüzdan onayı bekleniyor...',
      keyPending: 'Anahtar kayıt işlemi zincirde bekliyor...',
      keyFailed: 'Anahtar kaydı başarısız oldu.',
      encrypting: 'Mesaj browser içinde şifreleniyor...',
      preparingMessage: 'Mesaj hazırlanıyor...',
      txPending: 'İşlem zincirde bekliyor...',
      txSuccess: 'İşlem onaylandı. Mesaj zincire yazıldı.',
      sendFailed: 'Mesaj gönderilemedi.',
      addChainRejected: 'Arc Testnet geçişi reddedildi veya ağ eklenemedi.',
      recipientKeyMissing: 'Alıcının şifreleme anahtarı yok. Alıcı önce Arcanum’a kayıt olmalı.',
      explorer: 'Explorer',
    },
    common: {
      arcTestnet: 'Arc Testnet',
      private: 'Private',
      public: 'Public',
      contractUnavailable: 'Kontrat adresi yapılandırılmamış.',
    },
  },
} as const;

function shortenAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatTimestamp(timestamp: bigint, language: Language) {
  if (timestamp === BigInt(0)) {
    return '-';
  }

  return new Date(Number(timestamp) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US');
}

function compareMessagesAscending(a: ChainMessage, b: ChainMessage) {
  if (a.timestamp === b.timestamp) {
    return Number(a.id - b.id);
  }

  return a.timestamp > b.timestamp ? 1 : -1;
}

function buildConversations(messages: ChainMessage[], viewer?: `0x${string}`): Conversation[] {
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
      return;
    }

    map.set(key, {
      address: counterparty,
      messages: [message],
      latest: message,
    });
  });

  return Array.from(map.values())
    .map((conversation) => ({
      ...conversation,
      messages: [...conversation.messages].sort(compareMessagesAscending),
    }))
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState<ViewMode>('dm');
  const [newRecipient, setNewRecipient] = useState('');
  const [selectedConversation, setSelectedConversation] = useState<`0x${string}` | ''>('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('inbox');
  const [status, setStatus] = useState('');
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('idle');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastTxHash, setLastTxHash] = useState<`0x${string}` | undefined>();
  const [pendingRecipient, setPendingRecipient] = useState<`0x${string}` | ''>('');
  const [autoSwitchAttemptedFor, setAutoSwitchAttemptedFor] = useState('');

  const t = dictionary[language];
  const injectedConnector = connectors.find((connector) => connector.id === 'injected') ?? connectors[0];
  const activeRecipient = selectedConversation || newRecipient.trim();
  const recipientIsValid = isAddress(activeRecipient);
  const recipientIsSelf = Boolean(address && recipientIsValid && activeRecipient.toLowerCase() === address.toLowerCase());
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
    args: [recipientIsValid ? (activeRecipient as `0x${string}`) : zeroAddress],
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

  const inbox = useMemo(() => [...(((inboxMessages ?? []) as ChainMessage[]))].sort(compareMessagesAscending).reverse(), [inboxMessages]);
  const sent = useMemo(() => [...(((sentMessages ?? []) as ChainMessage[]))].sort(compareMessagesAscending).reverse(), [sentMessages]);
  const conversations = useMemo(() => buildConversations([...inbox, ...sent], address), [address, inbox, sent]);
  const selectedMessages = conversations.find((conversation) => conversation.address.toLowerCase() === activeRecipient.toLowerCase())?.messages ?? [];
  const hasOwnEncryptionKey = String(ownEncryptionKey ?? '').length > 0;
  const privateRecipientMissing = privacy === 'private' && recipientIsValid && !recipientEncryptionKey;
  const normalizedMessage = message.trim();

  const canSend = useMemo(() => {
    return (
      isConnected &&
      isArcanumMessengerConfigured &&
      isCorrectChain &&
      recipientIsValid &&
      !recipientIsSelf &&
      normalizedMessage.length > 0 &&
      !isWritePending
    );
  }, [isConnected, isCorrectChain, recipientIsSelf, recipientIsValid, normalizedMessage.length, isWritePending]);

  useEffect(() => {
    const storedLanguage = localStorage.getItem('arcanum.language');

    if (storedLanguage === 'en' || storedLanguage === 'tr') {
      setLanguageState(storedLanguage);
    }
  }, []);

  useEffect(() => {
    if (!isConnected || !address || isCorrectChain || autoSwitchAttemptedFor === address) {
      return;
    }

    setAutoSwitchAttemptedFor(address);
    void handleSwitchChain();
  }, [address, autoSwitchAttemptedFor, isConnected, isCorrectChain]);

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus(t.status.txSuccess);
      setNoticeTone('success');
      setMessage('');
      setPendingHash(undefined);

      if (pendingRecipient) {
        setSelectedConversation(pendingRecipient);
        setNewRecipient('');
        setPendingRecipient('');
      }

      void refetchInbox();
      void refetchSent();
      void refetchOwnKey();
    }
  }, [pendingRecipient, receipt.isSuccess, refetchInbox, refetchOwnKey, refetchSent, t.status.txSuccess]);

  function setLanguage(nextLanguage: Language) {
    setLanguageState(nextLanguage);
    localStorage.setItem('arcanum.language', nextLanguage);
  }

  async function handleSwitchChain() {
    setFlowError('');

    try {
      await switchChainAsync({ chainId: arcNetworkTestnet.id });
      return;
    } catch (error) {
      try {
        await window.ethereum?.request({
          method: 'wallet_addEthereumChain',
          params: [arcAddEthereumChainParams()],
        });
        await switchChainAsync({ chainId: arcNetworkTestnet.id });
      } catch (addError) {
        setNoticeTone('error');
        setFlowError(addError instanceof Error ? addError.message : t.status.addChainRejected);
      }
    }
  }

  async function handleRegisterKey() {
    if (!address || !isCorrectChain || !isArcanumMessengerConfigured) {
      return;
    }

    setFlowError('');
    setNoticeTone('pending');
    setStatus(t.status.keyPreparing);

    try {
      const keyPair = await ensureEncryptionKeyPair(address);
      setStatus(t.status.walletConfirmation);
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'registerEncryptionKey',
        args: [keyPair.publicKey],
      });

      setPendingHash(hash);
      setLastTxHash(hash);
      setStatus(t.status.keyPending);
    } catch (error) {
      setNoticeTone('error');
      setFlowError(error instanceof Error ? error.message : t.status.keyFailed);
      setStatus('');
    }
  }

  async function handleSendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!address || !canSend || !recipientIsValid) {
      return;
    }

    if (privacy === 'private' && !recipientEncryptionKey) {
      setNoticeTone('error');
      setFlowError(t.status.recipientKeyMissing);
      return;
    }

    const recipientAddress = activeRecipient as `0x${string}`;

    setFlowError('');
    setNoticeTone('pending');
    setStatus(privacy === 'private' ? t.status.encrypting : t.status.preparingMessage);

    try {
      const payload =
        privacy === 'private'
          ? await encryptMessage(normalizedMessage, String(recipientEncryptionKey), address)
          : normalizedMessage;

      setStatus(t.status.walletConfirmation);
      const hash = await writeContractAsync({
        address: arcanumMessengerAddress,
        abi: arcanumMessengerAbi,
        functionName: 'sendMessage',
        args: [recipientAddress, payload, privacy === 'private'],
      });

      setPendingHash(hash);
      setLastTxHash(hash);
      setPendingRecipient(recipientAddress);
      setStatus(t.status.txPending);
    } catch (error) {
      setNoticeTone('error');
      setFlowError(error instanceof Error ? error.message : t.status.sendFailed);
      setStatus('');
    }
  }

  function selectConversation(addressToSelect: `0x${string}`) {
    setSelectedConversation(addressToSelect);
    setNewRecipient('');
    setView('dm');
    setMenuOpen(false);
  }

  function handleNewRecipient(value: string) {
    setNewRecipient(value);
    setSelectedConversation('');
  }

  function refreshMessages() {
    void refetchInbox();
    void refetchSent();
  }

  function selectView(nextView: ViewMode) {
    setView(nextView);
    setMenuOpen(false);
  }

  const latestTxUrl = lastTxHash ? transactionUrl(lastTxHash) : undefined;
  const visibleHistoryMessages = historyTab === 'inbox' ? inbox : sent;
  const isFetchingMessages = isInboxFetching || isSentFetching;
  const errorMessages = [flowError, connectError?.message, switchError?.message, writeError?.message].filter(Boolean) as string[];

  return (
    <section className="mx-auto w-full max-w-7xl">
      <AppHeader
        t={t}
        language={language}
        address={address}
        isConnected={isConnected}
        isCorrectChain={isCorrectChain}
        isConnectPending={isConnectPending}
        isSwitchPending={isSwitchPending}
        connectorReady={Boolean(injectedConnector)}
        menuOpen={menuOpen}
        activeView={view}
        onToggleMenu={() => setMenuOpen((open) => !open)}
        onSelectView={selectView}
        onLanguageChange={setLanguage}
        onConnect={() => injectedConnector && connect({ connector: injectedConnector })}
        onDisconnect={() => disconnect()}
        onSwitchChain={handleSwitchChain}
      />

      <div className="mt-4">
        {view === 'dm' ? (
          <DirectMessagesView
            t={t}
            language={language}
            isConnected={isConnected}
            isCorrectChain={isCorrectChain}
            address={address}
            conversations={conversations}
            selectedConversation={selectedConversation}
            newRecipient={newRecipient}
            activeRecipient={activeRecipient}
            selectedMessages={selectedMessages}
            message={message}
            privacy={privacy}
            isWritePending={isWritePending}
            canSend={canSend}
            recipientIsValid={recipientIsValid}
            recipientIsSelf={recipientIsSelf}
            privateRecipientMissing={privateRecipientMissing}
            ownEncryptionKey={String(ownEncryptionKey ?? '')}
            onNewRecipientChange={handleNewRecipient}
            onSelectConversation={selectConversation}
            onMessageChange={setMessage}
            onPrivacyChange={setPrivacy}
            onRegisterKey={handleRegisterKey}
            onSubmit={handleSendMessage}
          />
        ) : null}

        {view === 'history' ? (
          <HistoryView
            t={t}
            language={language}
            tab={historyTab}
            messages={visibleHistoryMessages}
            viewer={address}
            isConnected={isConnected}
            isFetching={isFetchingMessages}
            onTabChange={setHistoryTab}
            onRefresh={refreshMessages}
            onReply={selectConversation}
          />
        ) : null}

        {view === 'about' ? <AboutView t={t} /> : null}
        {view === 'faq' ? <FaqView t={t} /> : null}
      </div>

      {!isArcanumMessengerConfigured ? (
        <div className="mt-4 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {t.common.contractUnavailable}
        </div>
      ) : null}

      <TransactionNotice status={status} tone={noticeTone} errors={errorMessages} txUrl={latestTxUrl} explorerLabel={t.status.explorer} />
    </section>
  );
}

function AppHeader({
  t,
  language,
  address,
  isConnected,
  isCorrectChain,
  isConnectPending,
  isSwitchPending,
  connectorReady,
  menuOpen,
  activeView,
  onToggleMenu,
  onSelectView,
  onLanguageChange,
  onConnect,
  onDisconnect,
  onSwitchChain,
}: {
  t: (typeof dictionary)[Language];
  language: Language;
  address?: `0x${string}`;
  isConnected: boolean;
  isCorrectChain: boolean;
  isConnectPending: boolean;
  isSwitchPending: boolean;
  connectorReady: boolean;
  menuOpen: boolean;
  activeView: ViewMode;
  onToggleMenu: () => void;
  onSelectView: (view: ViewMode) => void;
  onLanguageChange: (language: Language) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onSwitchChain: () => void;
}) {
  return (
    <header className="relative rounded-lg border border-zinc-800 bg-zinc-950/95 px-4 py-3 shadow-xl shadow-black/20">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onToggleMenu} className="btn-ghost h-10 w-10 shrink-0" aria-label={t.header.menu}>
            <Menu size={18} aria-hidden="true" />
          </button>
          <img src="/arcanum-logo.png" alt={t.header.logoAlt} className="h-10 w-28 shrink-0 object-contain object-left sm:w-36" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight text-white">Arcanum</h1>
              <StatusPill tone="success" icon={<Wifi size={13} aria-hidden="true" />} label={t.common.arcTestnet} />
            </div>
            <p className="mt-1 truncate text-sm text-zinc-500">{t.header.tagline}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
          <LanguageToggle language={language} label={t.header.language} onChange={onLanguageChange} />
          <StatusPill
            tone={isCorrectChain ? 'success' : 'warning'}
            icon={isCorrectChain ? <CheckCircle2 size={13} aria-hidden="true" /> : <AlertTriangle size={13} aria-hidden="true" />}
            label={isCorrectChain ? t.header.networkReady : t.header.wrongNetwork}
          />
          <StatusPill tone="neutral" label={`${t.header.contract} ${shortenAddress(arcanumMessengerAddress)}`} />
          {isConnected && address ? <StatusPill tone="neutral" icon={<Wallet size={13} aria-hidden="true" />} label={shortenAddress(address)} /> : null}

          {isConnected && !isCorrectChain ? (
            <button type="button" onClick={onSwitchChain} disabled={isSwitchPending} className="btn-primary h-10 px-4">
              {isSwitchPending ? t.header.switching : t.header.switchToArc}
            </button>
          ) : null}

          {isConnected ? (
            <button type="button" onClick={onDisconnect} className="btn-ghost h-10 px-3" aria-label={t.header.disconnect}>
              <X size={16} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" disabled={!connectorReady || isConnectPending} onClick={onConnect} className="btn-primary h-10 px-4">
              <Wallet size={16} aria-hidden="true" />
              {isConnectPending ? t.header.connecting : t.header.connect}
            </button>
          )}
        </div>
      </div>

      <AppMenu t={t} open={menuOpen} activeView={activeView} onSelectView={onSelectView} />
    </header>
  );
}

function AppMenu({
  t,
  open,
  activeView,
  onSelectView,
}: {
  t: (typeof dictionary)[Language];
  open: boolean;
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
}) {
  if (!open) {
    return null;
  }

  const items: Array<{ view: ViewMode; label: string; icon: ReactNode }> = [
    { view: 'dm', label: t.nav.directMessages, icon: <MessageCircle size={16} aria-hidden="true" /> },
    { view: 'history', label: t.nav.history, icon: <Archive size={16} aria-hidden="true" /> },
    { view: 'about', label: t.nav.about, icon: <Info size={16} aria-hidden="true" /> },
    { view: 'faq', label: t.nav.faq, icon: <HelpCircle size={16} aria-hidden="true" /> },
  ];

  return (
    <div className="absolute left-4 top-[calc(100%+0.5rem)] z-30 w-[calc(100vw-2rem)] max-w-xs rounded-lg border border-zinc-800 bg-zinc-950 p-2 shadow-2xl shadow-black/50">
      {items.map((item) => (
        <button
          key={item.view}
          type="button"
          onClick={() => onSelectView(item.view)}
          className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm font-medium transition ${
            activeView === item.view ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-900'
          }`}
        >
          {item.icon}
          <span className="truncate">{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function LanguageToggle({ language, label, onChange }: { language: Language; label: string; onChange: (language: Language) => void }) {
  return (
    <div className="inline-flex h-10 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-950 p-1" aria-label={label}>
      <Languages size={15} className="ml-2 text-zinc-500" aria-hidden="true" />
      {(['en', 'tr'] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`h-8 rounded px-2 text-xs font-semibold transition ${language === option ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-900'}`}
        >
          {option.toUpperCase()}
        </button>
      ))}
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
  selectedConversation,
  newRecipient,
  activeRecipient,
  selectedMessages,
  message,
  privacy,
  isWritePending,
  canSend,
  recipientIsValid,
  recipientIsSelf,
  privateRecipientMissing,
  ownEncryptionKey,
  onNewRecipientChange,
  onSelectConversation,
  onMessageChange,
  onPrivacyChange,
  onRegisterKey,
  onSubmit,
}: {
  t: (typeof dictionary)[Language];
  language: Language;
  isConnected: boolean;
  isCorrectChain: boolean;
  address?: `0x${string}`;
  conversations: Conversation[];
  selectedConversation: `0x${string}` | '';
  newRecipient: string;
  activeRecipient: string;
  selectedMessages: ChainMessage[];
  message: string;
  privacy: PrivacyMode;
  isWritePending: boolean;
  canSend: boolean;
  recipientIsValid: boolean;
  recipientIsSelf: boolean;
  privateRecipientMissing: boolean;
  ownEncryptionKey: string;
  onNewRecipientChange: (value: string) => void;
  onSelectConversation: (address: `0x${string}`) => void;
  onMessageChange: (value: string) => void;
  onPrivacyChange: (privacy: PrivacyMode) => void;
  onRegisterKey: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(280px,0.38fr)_minmax(0,0.62fr)]">
      <ConversationList
        t={t}
        language={language}
        isConnected={isConnected}
        viewer={address}
        conversations={conversations}
        selectedConversation={selectedConversation}
        newRecipient={newRecipient}
        onNewRecipientChange={onNewRecipientChange}
        onSelectConversation={onSelectConversation}
      />
      <ChatPanel
        t={t}
        language={language}
        isConnected={isConnected}
        isCorrectChain={isCorrectChain}
        viewer={address}
        activeRecipient={activeRecipient}
        selectedMessages={selectedMessages}
        message={message}
        privacy={privacy}
        isWritePending={isWritePending}
        canSend={canSend}
        recipientIsValid={recipientIsValid}
        recipientIsSelf={recipientIsSelf}
        privateRecipientMissing={privateRecipientMissing}
        ownEncryptionKey={ownEncryptionKey}
        onMessageChange={onMessageChange}
        onPrivacyChange={onPrivacyChange}
        onRegisterKey={onRegisterKey}
        onSubmit={onSubmit}
      />
    </div>
  );
}

function ConversationList({
  t,
  language,
  isConnected,
  viewer,
  conversations,
  selectedConversation,
  newRecipient,
  onNewRecipientChange,
  onSelectConversation,
}: {
  t: (typeof dictionary)[Language];
  language: Language;
  isConnected: boolean;
  viewer?: `0x${string}`;
  conversations: Conversation[];
  selectedConversation: `0x${string}` | '';
  newRecipient: string;
  onNewRecipientChange: (value: string) => void;
  onSelectConversation: (address: `0x${string}`) => void;
}) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t.dm.eyebrow}</p>
          <h2 className="panel-title">{t.dm.title}</h2>
        </div>
        <StatusPill tone="info" icon={<MessageCircle size={13} aria-hidden="true" />} label={`${conversations.length}`} />
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor="new-dm" className="block text-sm font-medium text-zinc-200">
          {t.dm.newChat}
        </label>
        <div className="relative">
          <PlusCircle size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" aria-hidden="true" />
          <input
            id="new-dm"
            value={newRecipient}
            onChange={(event) => onNewRecipientChange(event.target.value)}
            disabled={!isConnected}
            placeholder={t.dm.newChatPlaceholder}
            className="input pl-9 font-mono"
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {!isConnected ? <EmptyState tone="neutral" title={t.dm.noWalletTitle} body={t.dm.noWalletBody} /> : null}
        {isConnected && conversations.length === 0 ? <EmptyState tone="neutral" title={t.dm.noConversationsTitle} body={t.dm.noConversationsBody} /> : null}
        {conversations.map((conversation) => {
          const active = selectedConversation.toLowerCase() === conversation.address.toLowerCase();
          const outgoing = viewer ? conversation.latest.sender.toLowerCase() === viewer.toLowerCase() : false;

          return (
            <button
              key={conversation.address}
              type="button"
              onClick={() => onSelectConversation(conversation.address)}
              className={`w-full rounded-lg border p-3 text-left transition ${
                active ? 'border-emerald-400/40 bg-emerald-400/10' : 'border-zinc-800 bg-zinc-950 hover:border-zinc-700 hover:bg-zinc-900/60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-mono text-sm font-medium text-zinc-100">{shortenAddress(conversation.address)}</span>
                <span className="shrink-0 text-xs text-zinc-500">{formatTimestamp(conversation.latest.timestamp, language)}</span>
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                <StatusPill tone={conversation.latest.isPrivate ? 'success' : 'info'} label={conversation.latest.isPrivate ? t.common.private : t.common.public} />
                <span className="min-w-0 truncate">{outgoing ? t.history.to : t.history.from} #{conversation.latest.id.toString()}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ChatPanel({
  t,
  language,
  isConnected,
  isCorrectChain,
  viewer,
  activeRecipient,
  selectedMessages,
  message,
  privacy,
  isWritePending,
  canSend,
  recipientIsValid,
  recipientIsSelf,
  privateRecipientMissing,
  ownEncryptionKey,
  onMessageChange,
  onPrivacyChange,
  onRegisterKey,
  onSubmit,
}: {
  t: (typeof dictionary)[Language];
  language: Language;
  isConnected: boolean;
  isCorrectChain: boolean;
  viewer?: `0x${string}`;
  activeRecipient: string;
  selectedMessages: ChainMessage[];
  message: string;
  privacy: PrivacyMode;
  isWritePending: boolean;
  canSend: boolean;
  recipientIsValid: boolean;
  recipientIsSelf: boolean;
  privateRecipientMissing: boolean;
  ownEncryptionKey: string;
  onMessageChange: (value: string) => void;
  onPrivacyChange: (privacy: PrivacyMode) => void;
  onRegisterKey: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasRecipient = recipientIsValid && !recipientIsSelf;

  return (
    <section className="panel flex min-h-[620px] flex-col">
      <div className="panel-header">
        <div className="min-w-0">
          <p className="eyebrow">{t.dm.conversation}</p>
          <h2 className="panel-title truncate font-mono">{hasRecipient ? shortenAddress(activeRecipient) : t.dm.selectTitle}</h2>
        </div>
        <EncryptionKeyStatus
          t={t}
          hasKey={ownEncryptionKey.length > 0}
          canRegister={isConnected && isCorrectChain && !isWritePending}
          onRegister={onRegisterKey}
        />
      </div>

      <div className="mt-4 flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
        {!hasRecipient ? <EmptyState tone="neutral" title={t.dm.selectTitle} body={t.dm.selectBody} /> : null}
        {hasRecipient && selectedMessages.length === 0 ? <EmptyState tone="neutral" title={t.dm.noConversationsTitle} body={t.dm.noConversationsBody} /> : null}
        {selectedMessages.map((chainMessage) => (
          <MessageBubble key={chainMessage.id.toString()} message={chainMessage} viewer={viewer} language={language} t={t} />
        ))}
      </div>

      <ChatComposer
        t={t}
        isConnected={isConnected}
        isCorrectChain={isCorrectChain}
        message={message}
        privacy={privacy}
        isWritePending={isWritePending}
        canSend={canSend}
        recipientIsValid={recipientIsValid}
        recipientIsSelf={recipientIsSelf}
        privateRecipientMissing={privateRecipientMissing}
        activeRecipient={activeRecipient}
        onMessageChange={onMessageChange}
        onPrivacyChange={onPrivacyChange}
        onSubmit={onSubmit}
      />
    </section>
  );
}

function ChatComposer({
  t,
  isConnected,
  isCorrectChain,
  message,
  privacy,
  isWritePending,
  canSend,
  recipientIsValid,
  recipientIsSelf,
  privateRecipientMissing,
  activeRecipient,
  onMessageChange,
  onPrivacyChange,
  onSubmit,
}: {
  t: (typeof dictionary)[Language];
  isConnected: boolean;
  isCorrectChain: boolean;
  message: string;
  privacy: PrivacyMode;
  isWritePending: boolean;
  canSend: boolean;
  recipientIsValid: boolean;
  recipientIsSelf: boolean;
  privateRecipientMissing: boolean;
  activeRecipient: string;
  onMessageChange: (value: string) => void;
  onPrivacyChange: (privacy: PrivacyMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3">
      {!isConnected ? <EmptyState tone="neutral" title={t.dm.noWalletTitle} body={t.dm.noWalletBody} /> : null}
      {isConnected && !isCorrectChain ? <EmptyState tone="warning" title={t.header.wrongNetwork} body={t.header.switchToArc} /> : null}
      {activeRecipient && !recipientIsValid ? <p className="helper-warning">{t.composer.invalidRecipient}</p> : null}
      {recipientIsSelf ? <p className="helper-warning">{t.composer.selfRecipient}</p> : null}
      {privateRecipientMissing ? <p className="helper-warning">{t.composer.missingRecipientKey}</p> : null}

      <textarea
        value={message}
        onChange={(event) => onMessageChange(event.target.value)}
        disabled={!isConnected}
        maxLength={280}
        rows={3}
        placeholder={t.composer.placeholder}
        className="input min-h-24 resize-none py-3 leading-6"
      />

      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1 xl:w-72">
          <ModeButton active={privacy === 'private'} disabled={!isConnected} icon={<Lock size={16} aria-hidden="true" />} label={t.composer.private} onClick={() => onPrivacyChange('private')} />
          <ModeButton active={privacy === 'public'} disabled={!isConnected} icon={<Shield size={16} aria-hidden="true" />} label={t.composer.public} onClick={() => onPrivacyChange('public')} />
        </div>
        <button type="submit" disabled={!canSend || privateRecipientMissing} className="btn-primary h-11 px-5">
          <Send size={18} aria-hidden="true" />
          {isWritePending ? t.composer.waiting : t.composer.send}
        </button>
      </div>
      <p className="text-xs text-zinc-500">{privacy === 'private' ? t.composer.privateHint : t.composer.publicHint}</p>
    </form>
  );
}

function HistoryView({
  t,
  language,
  tab,
  messages,
  viewer,
  isConnected,
  isFetching,
  onTabChange,
  onRefresh,
  onReply,
}: {
  t: (typeof dictionary)[Language];
  language: Language;
  tab: HistoryTab;
  messages: ChainMessage[];
  viewer?: `0x${string}`;
  isConnected: boolean;
  isFetching: boolean;
  onTabChange: (tab: HistoryTab) => void;
  onRefresh: () => void;
  onReply: (address: `0x${string}`) => void;
}) {
  return (
    <section className="panel min-h-[620px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t.history.eyebrow}</p>
          <h2 className="panel-title">{t.history.title}</h2>
        </div>
        <button type="button" disabled={!isConnected || isFetching} onClick={onRefresh} className="btn-ghost h-10 w-10" aria-label={t.history.refresh}>
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
        <TabButton active={tab === 'inbox'} icon={<Inbox size={16} aria-hidden="true" />} label={t.history.inbox} onClick={() => onTabChange('inbox')} />
        <TabButton active={tab === 'sent'} icon={<Send size={16} aria-hidden="true" />} label={t.history.sent} onClick={() => onTabChange('sent')} />
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {!isConnected ? <EmptyState tone="neutral" title={t.history.disconnectedTitle} body={t.history.disconnectedBody} /> : null}
        {isConnected && messages.length === 0 ? <EmptyState tone="neutral" title={t.history.emptyTitle} body={t.history.emptyBody} /> : null}
        {messages.map((chainMessage) => {
          const counterparty = tab === 'inbox' ? chainMessage.sender : chainMessage.recipient;

          return (
            <MessageCard
              key={`${tab}-${chainMessage.id.toString()}`}
              message={chainMessage}
              viewer={viewer}
              language={language}
              t={t}
              actionLabel={tab === 'inbox' ? t.history.reply : t.history.openChat}
              onAction={() => onReply(counterparty)}
            />
          );
        })}
      </div>
    </section>
  );
}

function AboutView({ t }: { t: (typeof dictionary)[Language] }) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t.about.eyebrow}</p>
          <h2 className="panel-title">{t.about.title}</h2>
        </div>
        <StatusPill tone="success" icon={<Shield size={13} aria-hidden="true" />} label={t.common.arcTestnet} />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {t.about.body.map((paragraph) => (
          <div key={paragraph} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm leading-6 text-zinc-300">
            {paragraph}
          </div>
        ))}
      </div>
    </section>
  );
}

function FaqView({ t }: { t: (typeof dictionary)[Language] }) {
  return (
    <section className="panel min-h-[520px]">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t.faq.eyebrow}</p>
          <h2 className="panel-title">{t.faq.title}</h2>
        </div>
        <StatusPill tone="info" icon={<HelpCircle size={13} aria-hidden="true" />} label="FAQ" />
      </div>
      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        {t.faq.items.map(([question, answer]) => (
          <article key={question} className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
            <h3 className="text-sm font-semibold text-zinc-100">{question}</h3>
            <p className="mt-2 text-sm leading-6 text-zinc-500">{answer}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function EncryptionKeyStatus({
  t,
  hasKey,
  canRegister,
  onRegister,
}: {
  t: (typeof dictionary)[Language];
  hasKey: boolean;
  canRegister: boolean;
  onRegister: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <StatusPill
        tone={hasKey ? 'success' : 'warning'}
        icon={<KeyRound size={13} aria-hidden="true" />}
        label={hasKey ? t.key.registered : t.key.required}
      />
      {!hasKey ? (
        <button type="button" disabled={!canRegister} onClick={onRegister} className="btn-ghost h-9 px-3 text-xs">
          {t.key.register}
        </button>
      ) : null}
    </div>
  );
}

function TransactionNotice({
  status,
  tone,
  errors,
  txUrl,
  explorerLabel,
}: {
  status: string;
  tone: NoticeTone;
  errors: string[];
  txUrl?: string;
  explorerLabel: string;
}) {
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
            {explorerLabel}
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

function MessageBubble({
  message,
  viewer,
  language,
  t,
}: {
  message: ChainMessage;
  viewer?: `0x${string}`;
  language: Language;
  t: (typeof dictionary)[Language];
}) {
  const outgoing = viewer ? message.sender.toLowerCase() === viewer.toLowerCase() : false;

  return (
    <article className={`max-w-[86%] rounded-lg border px-3 py-2 shadow-lg shadow-black/10 ${outgoing ? 'ml-auto border-emerald-400/25 bg-emerald-400/10' : 'mr-auto border-zinc-800 bg-zinc-900'}`}>
      <MessageContent message={message} viewer={viewer} t={t} />
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-zinc-500">
        <StatusPill tone={message.isPrivate ? 'success' : 'info'} label={message.isPrivate ? t.common.private : t.common.public} />
        <span>{formatTimestamp(message.timestamp, language)}</span>
      </div>
    </article>
  );
}

function MessageCard({
  message,
  viewer,
  language,
  t,
  actionLabel,
  onAction,
}: {
  message: ChainMessage;
  viewer?: `0x${string}`;
  language: Language;
  t: (typeof dictionary)[Language];
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <article className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 shadow-lg shadow-black/10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          tone={message.isPrivate ? 'success' : 'info'}
          icon={message.isPrivate ? <Lock size={13} aria-hidden="true" /> : <Shield size={13} aria-hidden="true" />}
          label={message.isPrivate ? t.common.private : t.common.public}
        />
        <span className="font-mono text-xs text-zinc-500">#{message.id.toString()}</span>
      </div>
      <MessageContent message={message} viewer={viewer} t={t} />
      <div className="mt-4 grid gap-2 text-xs text-zinc-500 sm:grid-cols-2">
        <AddressMeta label={t.history.from} value={message.sender} />
        <AddressMeta label={t.history.to} value={message.recipient} />
        <div className="sm:col-span-2">
          <span className="text-zinc-600">{t.history.time} </span>
          <span>{formatTimestamp(message.timestamp, language)}</span>
        </div>
      </div>
      <button type="button" onClick={onAction} className="btn-ghost mt-4 h-10 px-3">
        <MessageCircle size={15} aria-hidden="true" />
        {actionLabel}
      </button>
    </article>
  );
}

function MessageContent({ message, viewer, t }: { message: ChainMessage; viewer?: `0x${string}`; t: (typeof dictionary)[Language] }) {
  const [decrypted, setDecrypted] = useState<string | null>(null);
  const [decryptError, setDecryptError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function decryptPrivateMessage() {
      if (!message.isPrivate || !viewer) {
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
          setDecryptError(t.dm.decryptFailed);
        }
      }
    }

    void decryptPrivateMessage();

    return () => {
      cancelled = true;
    };
  }, [message.isPrivate, message.payload, t.dm.decryptFailed, viewer]);

  const body = message.isPrivate ? decrypted ?? t.dm.encryptedPayload : message.payload;

  return (
    <div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{body}</p>
      {decryptError ? <p className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-sm text-amber-200">{decryptError}</p> : null}
    </div>
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

function ModeButton({ active, disabled, icon, label, onClick }: { active: boolean; disabled: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${active ? 'bg-white text-zinc-950' : 'text-zinc-300 hover:bg-zinc-800'}`}>
      {icon}
      {label}
    </button>
  );
}

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium transition ${active ? 'bg-white text-zinc-950' : 'text-zinc-400 hover:bg-zinc-800'}`}>
      {icon}
      {label}
    </button>
  );
}

function StatusPill({ tone, icon, label }: { tone: 'neutral' | 'success' | 'warning' | 'info'; icon?: ReactNode; label: string }) {
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
