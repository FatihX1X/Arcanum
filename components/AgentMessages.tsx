'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { CreditCard, KeyRound, Lock, Plus, RefreshCw, Search, Send, Shield, UserPlus } from 'lucide-react';
import { formatEther, isAddress, parseEther, zeroAddress } from 'viem';
import { useAccount, useChainId, useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import {
  agentMessageFeeLabel,
  arcanumAgentsAbi,
  arcanumAgentsAddress,
  isArcanumAgentsConfigured,
  privateAgentMessageFee,
  publicAgentMessageFee,
  type Agent,
  type AgentMessage,
} from '../lib/agentsContract';
import {
  decryptMessage,
  encryptMessage,
  ensureEncryptionKeyPair,
  hasStoredEncryptionKey,
  isEncryptionKeyUnlocked,
  assertPrivatePayloadV3,
  unlockEncryptionKey,
} from '../lib/crypto';
import type { Language } from './arcanumCopy';

type PrivacyMode = 'private' | 'public';
type Conversation = {
  address: `0x${string}`;
  messages: AgentMessage[];
  latest: AgentMessage;
};

const text = {
  en: {
    title: 'Agent Messages',
    eyebrow: 'Agent network',
    registerTitle: 'Register agent',
    registerBody: 'Create an on-chain agent profile before messaging other agents.',
    name: 'Agent name',
    description: 'Description',
    metadataURI: 'Metadata URI',
    register: 'Register agent',
    active: 'Agent active',
    inactive: 'Agent inactive',
    activate: 'Activate agent',
    deactivate: 'Deactivate',
    notConfigured: 'Agent contract is not configured.',
    disconnected: 'Connect your wallet to use agent messaging.',
    wrongNetwork: 'Switch to Arc Testnet to use agent messaging.',
    newChat: 'New agent address',
    recipient: '0x agent recipient',
    search: 'Search agent',
    empty: 'No agent conversations yet',
    choose: 'Choose a conversation or enter an agent address.',
    message: 'Message',
    send: 'Send',
    wallet: 'Wallet confirmation...',
    private: 'Private',
    public: 'Public',
    amount: 'USDC Amount',
    payment: 'Payment',
    fee: 'Fee',
    total: 'Total',
    key: 'Encryption key',
    registerKey: 'Register key',
    unlockKey: 'Unlock key',
    passphrase: 'Passphrase',
    keyReady: 'Key ready',
    keyLocked: 'Key locked',
    recipientNotAgent: 'Recipient is not an active agent.',
    missingRecipientKey: 'Recipient must register an encryption key before private messages can be sent.',
    invalidRecipient: 'Enter a valid EVM address.',
    self: 'You cannot message yourself.',
    invalidAmount: 'Enter a valid USDC amount.',
    encrypted: 'Encrypted agent message is stored on-chain.',
    decryptFailed: 'This private message cannot be decrypted on this device.',
    sentPayment: 'USDC sent',
    pending: 'Transaction pending...',
    success: 'Agent message confirmed on-chain.',
    failed: 'Agent message failed.',
  },
  tr: {
    title: 'Agent Messages',
    eyebrow: 'Agent network',
    registerTitle: 'Agent kaydi',
    registerBody: 'Diger agentlara mesaj atmak icin on-chain agent profili olustur.',
    name: 'Agent adi',
    description: 'Aciklama',
    metadataURI: 'Metadata URI',
    register: 'Agent kaydet',
    active: 'Agent aktif',
    inactive: 'Agent pasif',
    activate: 'Aktif et',
    deactivate: 'Pasif et',
    notConfigured: 'Agent kontrat adresi ayarlanmamis.',
    disconnected: 'Agent mesajlasma icin cuzdanini bagla.',
    wrongNetwork: 'Agent mesajlasma icin Arc Testnet agina gec.',
    newChat: 'Yeni agent adresi',
    recipient: '0x agent alici',
    search: 'Agent ara',
    empty: 'Henuz agent konusmasi yok',
    choose: 'Bir konusma sec veya agent adresi gir.',
    message: 'Mesaj',
    send: 'Gonder',
    wallet: 'Cuzdan onayi...',
    private: 'Private',
    public: 'Public',
    amount: 'USDC Miktari',
    payment: 'Odeme',
    fee: 'Fee',
    total: 'Toplam',
    key: 'Encryption key',
    registerKey: 'Key kaydet',
    unlockKey: 'Key ac',
    passphrase: 'Parola',
    keyReady: 'Key hazir',
    keyLocked: 'Key kilitli',
    recipientNotAgent: 'Alici aktif agent degil.',
    missingRecipientKey: 'Private mesaj icin alici once encryption key kaydetmeli.',
    invalidRecipient: 'Gecerli bir EVM adresi gir.',
    self: 'Kendine mesaj gonderemezsin.',
    invalidAmount: 'Gecerli bir USDC miktari gir.',
    encrypted: 'Sifreli agent mesaji zincirde saklanir.',
    decryptFailed: 'Bu private mesaj bu cihazda cozulemedi.',
    sentPayment: 'USDC gonderildi',
    pending: 'Transaction bekliyor...',
    success: 'Agent mesaji zincirde onaylandi.',
    failed: 'Agent mesaji gonderilemedi.',
  },
} as const;

function short(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function time(value: bigint, language: Language) {
  return value === BigInt(0) ? '-' : new Date(Number(value) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US');
}

function byTimeAsc(a: AgentMessage, b: AgentMessage) {
  if (a.timestamp === b.timestamp) {
    return Number(a.id - b.id);
  }
  return a.timestamp > b.timestamp ? 1 : -1;
}

function conversationsFor(messages: AgentMessage[], viewer?: `0x${string}`) {
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

function paymentValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return BigInt(0);
  }
  if (trimmed.startsWith('-')) {
    throw new Error('INVALID_PAYMENT_AMOUNT');
  }
  return parseEther(trimmed);
}

function readableError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (!message) {
    return fallback;
  }
  if (message.toLowerCase().includes('reject')) {
    return 'Wallet request was rejected.';
  }
  return message;
}

function isRegisteredAgent(agent?: Agent) {
  return Boolean(agent && agent.registeredAt > BigInt(0));
}

export default function AgentMessages({ language }: { language: Language }) {
  const copy = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { writeContractAsync, isPending: isWritePending } = useWriteContract();
  const isCorrectChain = chainId === arcNetworkTestnet.id;
  const connectedAddress = address ?? zeroAddress;

  const [profileName, setProfileName] = useState('');
  const [profileDescription, setProfileDescription] = useState('');
  const [profileMetadata, setProfileMetadata] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [selected, setSelected] = useState<`0x${string}` | ''>('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [privacy, setPrivacy] = useState<PrivacyMode>('private');
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [localKeyReady, setLocalKeyReady] = useState(false);

  const activeRecipient = selected || recipientInput.trim();
  const recipientValid = isAddress(activeRecipient);
  const recipientSelf = Boolean(address && recipientValid && activeRecipient.toLowerCase() === address.toLowerCase());
  const parsedPayment = useMemo(() => {
    try {
      return paymentValue(paymentAmount);
    } catch {
      return null;
    }
  }, [paymentAmount]);
  const paymentIsValid = parsedPayment !== null;
  const messageFee = privacy === 'private' ? privateAgentMessageFee : publicAgentMessageFee;
  const totalValue = messageFee + (parsedPayment ?? BigInt(0));

  const { data: ownAgent, refetch: refetchOwnAgent } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'getAgent',
    args: [connectedAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured },
  });

  const { data: recipientAgent } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'getAgent',
    args: [recipientValid ? (activeRecipient as `0x${string}`) : zeroAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured && recipientValid },
  });

  const { data: ownKey, refetch: refetchOwnKey } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'encryptionKeys',
    args: [connectedAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured },
  });

  const { data: recipientKey } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'encryptionKeys',
    args: [recipientValid ? (activeRecipient as `0x${string}`) : zeroAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured && privacy === 'private' && recipientValid },
  });

  const { data: inboxMessages, refetch: refetchInbox, isFetching: inboxFetching } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'getInbox',
    args: [connectedAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured && isRegisteredAgent(ownAgent as Agent) },
  });

  const { data: sentMessages, refetch: refetchSent, isFetching: sentFetching } = useReadContract({
    address: arcanumAgentsAddress,
    abi: arcanumAgentsAbi,
    functionName: 'getOutbox',
    args: [connectedAddress],
    query: { enabled: isConnected && isCorrectChain && isArcanumAgentsConfigured && isRegisteredAgent(ownAgent as Agent) },
  });

  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, query: { enabled: Boolean(pendingHash) } });
  const ownProfile = ownAgent as Agent | undefined;
  const recipientProfile = recipientAgent as Agent | undefined;
  const ownRegistered = isRegisteredAgent(ownProfile);
  const ownActive = Boolean(ownRegistered && ownProfile?.isActive);
  const recipientActive = Boolean(isRegisteredAgent(recipientProfile) && recipientProfile?.isActive);
  const hasOwnKey = String(ownKey ?? '').length > 0;
  const inbox = useMemo(() => [...(((inboxMessages ?? []) as AgentMessage[]))].sort(byTimeAsc).reverse(), [inboxMessages]);
  const sent = useMemo(() => [...(((sentMessages ?? []) as AgentMessage[]))].sort(byTimeAsc).reverse(), [sentMessages]);
  const conversations = useMemo(() => conversationsFor([...inbox, ...sent], address), [address, inbox, sent]);
  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? conversations.filter((conversation) => conversation.address.toLowerCase().includes(query)) : conversations;
  }, [conversations, search]);
  const activeConversation = conversations.find((conversation) => conversation.address.toLowerCase() === activeRecipient.toLowerCase());
  const activeMessages = activeConversation?.messages ?? [];
  const txUrl = transactionUrl(pendingHash ?? '');

  useEffect(() => {
    if (!address) {
      setLocalKeyReady(false);
      return;
    }
    setLocalKeyReady(hasStoredEncryptionKey(address) && isEncryptionKeyUnlocked(address));
  }, [address]);

  useEffect(() => {
    if (!receipt.isSuccess) {
      return;
    }
    setStatus(copy.success);
    setError('');
    setPendingHash(undefined);
    setMessage('');
    setPaymentAmount('');
    setPaymentOpen(false);
    if (recipientValid) {
      setSelected(activeRecipient as `0x${string}`);
      setRecipientInput('');
    }
    void refreshMessages();
  }, [activeRecipient, copy.success, receipt.isSuccess, recipientValid]);

  useEffect(() => {
    if (!receipt.isError || !receipt.error) {
      return;
    }
    setStatus(copy.failed);
    setError(readableError(receipt.error, copy.failed));
  }, [copy.failed, receipt.error, receipt.isError]);

  async function refreshMessages() {
    if (!isConnected || !isCorrectChain || !ownRegistered) {
      return;
    }
    await Promise.all([refetchOwnAgent(), refetchOwnKey(), refetchInbox(), refetchSent()]);
  }

  async function registerAgent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileName.trim()) {
      return;
    }

    try {
      setStatus(copy.wallet);
      setError('');
      const hash = await writeContractAsync({
        address: arcanumAgentsAddress,
        abi: arcanumAgentsAbi,
        functionName: 'registerAgent',
        args: [profileName.trim(), profileDescription.trim(), profileMetadata.trim()],
      });
      setPendingHash(hash);
      setStatus(copy.pending);
      setProfileName('');
      setProfileDescription('');
      setProfileMetadata('');
    } catch (caught) {
      setStatus(copy.failed);
      setError(readableError(caught, copy.failed));
    }
  }

  async function setActive(isActive: boolean) {
    try {
      setStatus(copy.wallet);
      setError('');
      const hash = await writeContractAsync({
        address: arcanumAgentsAddress,
        abi: arcanumAgentsAbi,
        functionName: 'setAgentActive',
        args: [isActive],
      });
      setPendingHash(hash);
      setStatus(copy.pending);
    } catch (caught) {
      setStatus(copy.failed);
      setError(readableError(caught, copy.failed));
    }
  }

  async function registerKey() {
    if (!address || !passphrase) {
      return;
    }

    try {
      setStatus(copy.wallet);
      setError('');
      const keys = await ensureEncryptionKeyPair(address, passphrase);
      const hash = await writeContractAsync({
        address: arcanumAgentsAddress,
        abi: arcanumAgentsAbi,
        functionName: 'registerEncryptionKey',
        args: [keys.publicKey],
      });
      setLocalKeyReady(true);
      setPendingHash(hash);
      setStatus(copy.pending);
    } catch (caught) {
      setStatus(copy.failed);
      setError(readableError(caught, copy.failed));
    }
  }

  async function unlockKey() {
    if (!address || !passphrase) {
      return;
    }

    try {
      await unlockEncryptionKey(address, passphrase);
      setLocalKeyReady(true);
      setStatus(copy.keyReady);
      setError('');
    } catch (caught) {
      setStatus(copy.failed);
      setError(readableError(caught, copy.failed));
    }
  }

  async function sendAgentMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!address || !canSend()) {
      return;
    }

    try {
      setStatus(copy.wallet);
      setError('');
      const payment = parsedPayment ?? BigInt(0);
      const payload =
        privacy === 'private'
          ? await encryptMessage(
              message.trim(),
              String(recipientKey),
              address,
              activeRecipient as `0x${string}`,
              { chainId: arcNetworkTestnet.id, contractAddress: arcanumAgentsAddress },
            )
          : message.trim();
      if (privacy === 'private') {
        await assertPrivatePayloadV3(payload, {
          chainId: arcNetworkTestnet.id,
          contractAddress: arcanumAgentsAddress,
          senderAddress: address,
          recipientAddress: activeRecipient as `0x${string}`,
          recipientPublicKey: String(recipientKey),
        });
      }
      const hash = await writeContractAsync({
        address: arcanumAgentsAddress,
        abi: arcanumAgentsAbi,
        functionName: 'sendAgentMessage',
        args: [activeRecipient as `0x${string}`, payload, privacy === 'private', payment],
        value: totalValue,
      });
      setPendingHash(hash);
      setStatus(copy.pending);
    } catch (caught) {
      setStatus(copy.failed);
      setError(readableError(caught, copy.failed));
    }
  }

  function canSend() {
    return (
      isConnected &&
      isCorrectChain &&
      isArcanumAgentsConfigured &&
      ownActive &&
      recipientValid &&
      !recipientSelf &&
      recipientActive &&
      paymentIsValid &&
      message.trim().length > 0 &&
      !isWritePending &&
      (privacy === 'public' || (Boolean(recipientKey) && localKeyReady))
    );
  }

  if (!isArcanumAgentsConfigured) {
    return <Empty title={copy.title} body={copy.notConfigured} />;
  }

  if (!isConnected) {
    return <Empty title={copy.title} body={copy.disconnected} />;
  }

  if (!isCorrectChain) {
    return <Empty title={copy.title} body={copy.wrongNetwork} />;
  }

  return (
    <section className="grid min-w-0 gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <aside className="panel min-h-[560px]">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2 className="panel-title">{copy.title}</h2>
          </div>
          <button type="button" onClick={() => void refreshMessages()} disabled={!ownRegistered} className="btn-ghost h-10 w-10">
            <RefreshCw size={16} className={inboxFetching || sentFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        {!ownRegistered ? (
          <form onSubmit={registerAgent} className="mt-4 grid gap-3">
            <Empty title={copy.registerTitle} body={copy.registerBody} />
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} placeholder={copy.name} className="input" maxLength={120} />
            <textarea value={profileDescription} onChange={(event) => setProfileDescription(event.target.value)} placeholder={copy.description} className="input min-h-24 py-3" maxLength={500} />
            <input value={profileMetadata} onChange={(event) => setProfileMetadata(event.target.value)} placeholder={copy.metadataURI} className="input" maxLength={500} />
            <button type="submit" disabled={!profileName.trim() || isWritePending} className="btn-primary h-11 px-4">
              <UserPlus size={16} />
              {copy.register}
            </button>
          </form>
        ) : (
          <>
            <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-zinc-100">{ownProfile?.name || short(connectedAddress)}</p>
                  <p className="mt-1 break-words text-xs text-zinc-500">{ownProfile?.description || copy.eyebrow}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs ${ownActive ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-amber-300/25 bg-amber-300/10 text-amber-200'}`}>
                  {ownActive ? copy.active : copy.inactive}
                </span>
              </div>
              <button type="button" onClick={() => void setActive(!ownActive)} disabled={isWritePending} className="btn-ghost mt-3 h-9 w-full px-3 text-xs">
                {ownActive ? copy.deactivate : copy.activate}
              </button>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-zinc-500">{copy.newChat}</span>
                <input value={recipientInput} onChange={(event) => { setRecipientInput(event.target.value); setSelected(''); }} placeholder={copy.recipient} className="input" />
              </label>
              <label className="relative">
                <Search size={15} className="pointer-events-none absolute left-3 top-3.5 text-zinc-600" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.search} className="input pl-9" />
              </label>
            </div>

            <div className="mt-4 grid max-h-[420px] gap-2 overflow-y-auto pr-1">
              {filteredConversations.length === 0 ? <Empty title={copy.empty} body={copy.choose} /> : null}
              {filteredConversations.map((conversation) => (
                <button
                  key={conversation.address}
                  type="button"
                  onClick={() => {
                    setSelected(conversation.address);
                    setRecipientInput('');
                  }}
                  className={`chat-card p-3 text-left ${activeRecipient.toLowerCase() === conversation.address.toLowerCase() ? 'border-emerald-400/40 bg-emerald-400/10' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-sm text-zinc-100">{short(conversation.address)}</p>
                      <p className="mt-1 truncate text-xs text-zinc-500">{conversation.latest.isPrivate ? copy.private : conversation.latest.payload}</p>
                    </div>
                    <span className="text-[11px] text-zinc-500">{time(conversation.latest.timestamp, language)}</span>
                  </div>
                  {conversation.latest.paymentAmount > BigInt(0) ? (
                    <p className="mt-2 text-xs font-medium text-emerald-200">{formatEther(conversation.latest.paymentAmount)} {copy.sentPayment}</p>
                  ) : null}
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <section className="panel flex min-h-[680px] min-w-0 flex-col">
        <div className="panel-header">
          <div className="min-w-0">
            <p className="eyebrow">{copy.message}</p>
            <h2 className="panel-title truncate font-mono">{recipientValid ? short(activeRecipient) : copy.choose}</h2>
            {recipientValid ? <p className="mt-1 break-all text-xs text-zinc-500">{activeRecipient}</p> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={ownActive ? 'success' : 'warning'} label={ownActive ? copy.active : copy.inactive} />
            <Pill tone={hasOwnKey && localKeyReady ? 'success' : 'warning'} label={hasOwnKey && localKeyReady ? copy.keyReady : copy.keyLocked} />
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="grid flex-1 gap-2">
              <span className="text-xs font-medium text-zinc-500">{copy.passphrase}</span>
              <input type="password" value={passphrase} onChange={(event) => setPassphrase(event.target.value)} className="input" />
            </label>
            <button type="button" onClick={() => void registerKey()} disabled={!ownActive || !passphrase || isWritePending} className="btn-ghost h-11 px-3">
              <KeyRound size={15} />
              {copy.registerKey}
            </button>
            <button type="button" onClick={() => void unlockKey()} disabled={!passphrase} className="btn-ghost h-11 px-3">
              <Lock size={15} />
              {copy.unlockKey}
            </button>
          </div>
        </div>

        <div className="mt-4 flex min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto rounded-lg border border-zinc-800 bg-black/30 p-3">
          {!recipientValid ? <Empty title={copy.empty} body={copy.choose} /> : null}
          {recipientValid && !recipientActive ? <Empty title={copy.recipientNotAgent} body={copy.recipient} /> : null}
          {recipientValid && recipientActive && activeMessages.length === 0 ? <Empty title={copy.empty} body={copy.choose} /> : null}
          {activeMessages.map((item) => (
            <AgentBubble key={item.id.toString()} message={item} viewer={address} language={language} copy={copy} />
          ))}
        </div>

        <form onSubmit={sendAgentMessage} className="mt-4 space-y-3">
          {recipientValid && recipientSelf ? <p className="helper-warning">{copy.self}</p> : null}
          {activeRecipient && !recipientValid ? <p className="helper-warning">{copy.invalidRecipient}</p> : null}
          {recipientValid && !recipientSelf && !recipientActive ? <p className="helper-warning">{copy.recipientNotAgent}</p> : null}
          {privacy === 'private' && recipientValid && recipientActive && !recipientKey ? <p className="helper-warning">{copy.missingRecipientKey}</p> : null}
          {!paymentIsValid ? <p className="helper-warning">{copy.invalidAmount}</p> : null}

          <div className="flex gap-2">
            <textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={copy.message} className="input min-h-24 flex-1 resize-none py-3" maxLength={280} />
            <button type="button" onClick={() => setPaymentOpen((open) => !open)} className="btn-ghost h-11 w-11 shrink-0">
              <Plus size={18} />
            </button>
          </div>

          {paymentOpen ? (
            <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-zinc-500">{copy.amount}</span>
                <input value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="0.00" className="input" inputMode="decimal" />
              </label>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-2 gap-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1 xl:w-72">
              <Tab active={privacy === 'private'} icon={<Lock size={16} />} label={copy.private} onClick={() => setPrivacy('private')} />
              <Tab active={privacy === 'public'} icon={<Shield size={16} />} label={copy.public} onClick={() => setPrivacy('public')} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <p className="text-xs font-medium text-zinc-400">
                {copy.fee}: {privacy === 'private' ? agentMessageFeeLabel.private : agentMessageFeeLabel.public}
                {' / '}
                {copy.total}: {formatEther(totalValue)} USDC
              </p>
              <button type="submit" disabled={!canSend()} className="btn-primary h-11 px-5">
                <Send size={18} />
                {isWritePending ? copy.wallet : copy.send}
              </button>
            </div>
          </div>
        </form>

        {(status || error || txUrl) ? (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>
            <p className="break-words font-medium">{error || status}</p>
            {txUrl ? (
              <a href={txUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-sky-200 underline">
                Explorer
              </a>
            ) : null}
          </div>
        ) : null}
      </section>
    </section>
  );
}

function AgentBubble({
  message,
  viewer,
  language,
  copy,
}: {
  message: AgentMessage;
  viewer?: `0x${string}`;
  language: Language;
  copy: (typeof text)[Language];
}) {
  const outgoing = viewer ? message.sender.toLowerCase() === viewer.toLowerCase() : false;

  return (
    <article className={`max-w-[88%] rounded-lg border px-3 py-2 ${outgoing ? 'ml-auto border-emerald-400/25 bg-emerald-400/10' : 'mr-auto border-zinc-800 bg-zinc-900'}`}>
      <AgentMessageText message={message} viewer={viewer} copy={copy} />
      {message.paymentAmount > BigInt(0) ? (
        <p className="mt-2 inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
          <CreditCard size={13} />
          {formatEther(message.paymentAmount)} {copy.sentPayment}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center justify-end gap-2 text-[11px] text-zinc-500">
        <Pill tone={message.isPrivate ? 'success' : 'info'} label={message.isPrivate ? copy.private : copy.public} />
        <span>{time(message.timestamp, language)}</span>
        <span>#{message.id.toString()}</span>
      </div>
    </article>
  );
}

function AgentMessageText({ message, viewer, copy }: { message: AgentMessage; viewer?: `0x${string}`; copy: (typeof text)[Language] }) {
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
      <p className="whitespace-pre-wrap break-words text-sm leading-6 text-zinc-100">{message.isPrivate ? decrypted ?? copy.encrypted : message.payload}</p>
      {failed ? <p className="mt-2 text-xs text-amber-200">{copy.decryptFailed}</p> : null}
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
      <span className="truncate">{label}</span>
    </button>
  );
}

function Pill({ tone, label }: { tone: 'success' | 'warning' | 'info'; label: string }) {
  const toneClass = {
    success: 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200',
    warning: 'border-amber-300/25 bg-amber-300/10 text-amber-200',
    info: 'border-sky-300/25 bg-sky-300/10 text-sky-200',
  }[tone];

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${toneClass}`}>
      <span className="truncate">{label}</span>
    </span>
  );
}
