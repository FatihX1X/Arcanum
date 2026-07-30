'use client';

import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  History,
  Inbox,
  Layers3,
  Lock,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEther, type PublicClient } from 'viem';
import { useAccount, useChainId, usePublicClient } from 'wagmi';

import { arcanumAgentsAbi, arcanumAgentsAddress, type AgentMessage } from '@/lib/agentsContract';
import { arcanumBulkSenderAbi, arcanumBulkSenderAddress } from '@/lib/bulkContract';
import { arcNetworkTestnet, transactionUrl } from '@/lib/chain';
import { arcanumMessengerAbi, arcanumMessengerAddress, type ChainMessage } from '@/lib/contract';
import { decryptMessage } from '@/lib/crypto';
import { arcTestnetDeployments } from '@/lib/deployments';
import {
  arcanumEscrowAbi,
  arcanumEscrowAddress,
  arcanumGigBoardAbi,
  arcanumGigBoardAddress,
  type EscrowRecord,
} from '@/lib/escrowContracts';
import {
  filterHistory,
  readLocalSwapHistory,
  sortAndDedupeHistory,
  type BulkHistoryItem,
  type EscrowHistoryItem,
  type HistoryItem,
  type HistoryTab,
  type MessageHistoryItem,
  type SwapHistoryItem,
} from '@/lib/history';
import { readableRpcError, withRpcRetry } from '@/lib/rpc';

type Language = 'en' | 'tr';
type HistoryCopy = {
  eyebrow: string;
  title: string;
  tabs: Record<HistoryTab, string>;
  refresh: string;
  search: string;
  loadMore: string;
  disconnected: string;
  wrongNetwork: string;
  loading: string;
  empty: string;
  partial: string;
  arcscanUnavailable: string;
  rpcLimited: string;
  incoming: string;
  outgoing: string;
  direct: string;
  agent: string;
  private: string;
  public: string;
  locked: string;
  decryptFailed: string;
  payment: string;
  from: string;
  to: string;
  amount: string;
  received: string;
  minimum: string;
  fees: string;
  roles: string;
  recipients: string;
  showRecipients: string;
  hideRecipients: string;
  viewTransaction: string;
  statuses: Record<HistoryItem['status'], string>;
};

const copy: Record<Language, HistoryCopy> = {
  en: {
    eyebrow: 'History',
    title: 'Activity history',
    tabs: { all: 'All', incoming: 'Incoming', outgoing: 'Outgoing', swap: 'Swap', escrow: 'Escrow', bulk: 'Bulk Sender' },
    refresh: 'Refresh',
    search: 'Search address, content, hash or ID',
    loadMore: 'Load more',
    disconnected: 'Connect your wallet to view your history.',
    wrongNetwork: 'Switch to Arc Testnet to load on-chain history.',
    loading: 'Loading on-chain activity…',
    empty: 'No matching activity was found.',
    partial: 'Some history sources could not be loaded. Available records are shown below.',
    arcscanUnavailable: 'ArcScan is temporarily unavailable. Locally recorded swaps are still shown.',
    rpcLimited: 'The Arc RPC rate limit was reached. Try refreshing shortly.',
    incoming: 'Incoming',
    outgoing: 'Outgoing',
    direct: 'Direct message',
    agent: 'Agent message',
    private: 'Private',
    public: 'Public',
    locked: 'Unlock or import this wallet encryption key to read the private message.',
    decryptFailed: 'This private message could not be decrypted.',
    payment: 'Agent payment',
    from: 'From',
    to: 'To',
    amount: 'Sent',
    received: 'Received',
    minimum: 'Minimum output',
    fees: 'Fees',
    roles: 'Roles',
    recipients: 'recipients',
    showRecipients: 'Show recipients',
    hideRecipients: 'Hide recipients',
    viewTransaction: 'Open in ArcScan',
    statuses: { confirmed: 'Confirmed', pending: 'Pending', failed: 'Failed', estimated: 'Estimated' },
  },
  tr: {
    eyebrow: 'Geçmiş',
    title: 'İşlem geçmişi',
    tabs: { all: 'Genel', incoming: 'Gelen Mesaj', outgoing: 'Giden Mesaj', swap: 'Swap', escrow: 'Escrow', bulk: 'Bulk Sender' },
    refresh: 'Yenile',
    search: 'Adres, içerik, hash veya ID ara',
    loadMore: 'Daha fazla yükle',
    disconnected: 'Geçmişinizi görmek için cüzdanınızı bağlayın.',
    wrongNetwork: 'Zincir üstü geçmişi yüklemek için Arc Testnet ağına geçin.',
    loading: 'Zincir üstü hareketler yükleniyor…',
    empty: 'Eşleşen bir hareket bulunamadı.',
    partial: 'Bazı geçmiş kaynakları yüklenemedi. Erişilebilen kayıtlar aşağıda gösteriliyor.',
    arcscanUnavailable: 'ArcScan geçici olarak kullanılamıyor. Yerel swap kayıtları gösterilmeye devam ediyor.',
    rpcLimited: 'Arc RPC sorgu sınırına ulaşıldı. Kısa süre sonra yeniden deneyin.',
    incoming: 'Gelen',
    outgoing: 'Giden',
    direct: 'Direkt mesaj',
    agent: 'Agent mesajı',
    private: 'Özel',
    public: 'Herkese açık',
    locked: 'Özel mesajı okumak için bu cüzdanın şifreleme anahtarını açın veya içe aktarın.',
    decryptFailed: 'Bu özel mesaj çözülemedi.',
    payment: 'Agent ödemesi',
    from: 'Gönderen',
    to: 'Alıcı',
    amount: 'Gönderilen',
    received: 'Alınan',
    minimum: 'Minimum çıktı',
    fees: 'Ücretler',
    roles: 'Roller',
    recipients: 'alıcı',
    showRecipients: 'Alıcıları göster',
    hideRecipients: 'Alıcıları gizle',
    viewTransaction: 'ArcScan’de aç',
    statuses: { confirmed: 'Onaylandı', pending: 'Bekliyor', failed: 'Başarısız', estimated: 'Tahmini' },
  },
};

const pageSize = 12;
const blockTimestampCache = new Map<bigint, number>();

type EventLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash?: `0x${string}`;
  logIndex?: number;
};

function asEventLogs(value: unknown) {
  return value as EventLog[];
}

function address(value: unknown) {
  return String(value ?? '') as `0x${string}`;
}

function bigint(value: unknown) {
  return typeof value === 'bigint' ? value : BigInt(String(value ?? 0));
}

function short(value: string) {
  return value.length > 13 ? `${value.slice(0, 7)}…${value.slice(-5)}` : value;
}

function formatTimestamp(timestamp: number, language: Language) {
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

async function timestampsFor(client: PublicClient, blocks: bigint[]) {
  const unique = [...new Set(blocks)].filter((block) => !blockTimestampCache.has(block));
  for (let index = 0; index < unique.length; index += 6) {
    await Promise.all(unique.slice(index, index + 6).map(async (blockNumber) => {
      const block = await withRpcRetry(() => client.getBlock({ blockNumber }));
      blockTimestampCache.set(blockNumber, Number(block.timestamp) * 1000);
    }));
  }
  return (block: bigint) => blockTimestampCache.get(block) ?? Date.now();
}

function normalizeMessages(
  directInbox: readonly ChainMessage[],
  directOutbox: readonly ChainMessage[],
  agentInbox: readonly AgentMessage[],
  agentOutbox: readonly AgentMessage[],
): MessageHistoryItem[] {
  const build = (
    message: ChainMessage | AgentMessage,
    channel: 'direct' | 'agent',
    direction: 'incoming' | 'outgoing',
  ): MessageHistoryItem => ({
    id: `${arcNetworkTestnet.id}:${channel}:${direction}:${message.id}`,
    kind: 'message',
    timestamp: Number(message.timestamp) * 1000,
    status: 'confirmed',
    channel,
    direction,
    messageId: message.id.toString(),
    sender: message.sender,
    recipient: message.recipient,
    payload: message.payload,
    isPrivate: message.isPrivate,
    paymentAmount: 'paymentAmount' in message ? formatEther(message.paymentAmount) : undefined,
  });
  return [
    ...directInbox.map((message) => build(message, 'direct', 'incoming')),
    ...directOutbox.map((message) => build(message, 'direct', 'outgoing')),
    ...agentInbox.map((message) => build(message, 'agent', 'incoming')),
    ...agentOutbox.map((message) => build(message, 'agent', 'outgoing')),
  ];
}

async function loadMessages(client: PublicClient, account: `0x${string}`) {
  const [directInbox, directOutbox, agentInbox, agentOutbox] = await Promise.all([
    withRpcRetry(() => client.readContract({ address: arcanumMessengerAddress, abi: arcanumMessengerAbi, functionName: 'getInbox', args: [account] })),
    withRpcRetry(() => client.readContract({ address: arcanumMessengerAddress, abi: arcanumMessengerAbi, functionName: 'getOutbox', args: [account] })),
    withRpcRetry(() => client.readContract({ address: arcanumAgentsAddress, abi: arcanumAgentsAbi, functionName: 'getInbox', args: [account] })),
    withRpcRetry(() => client.readContract({ address: arcanumAgentsAddress, abi: arcanumAgentsAbi, functionName: 'getOutbox', args: [account] })),
  ]);
  return normalizeMessages(directInbox, directOutbox, agentInbox, agentOutbox);
}

async function loadBulk(client: PublicClient, account: `0x${string}`): Promise<BulkHistoryItem[]> {
  const [batchesRaw, transfersRaw] = await Promise.all([
    withRpcRetry(() => client.getContractEvents({
      address: arcanumBulkSenderAddress,
      abi: arcanumBulkSenderAbi,
      eventName: 'BatchSent',
      args: { sender: account },
      fromBlock: BigInt(arcTestnetDeployments.bulkSender.blockNumber),
      toBlock: 'latest',
    })),
    withRpcRetry(() => client.getContractEvents({
      address: arcanumBulkSenderAddress,
      abi: arcanumBulkSenderAbi,
      eventName: 'TransferSent',
      fromBlock: BigInt(arcTestnetDeployments.bulkSender.blockNumber),
      toBlock: 'latest',
    })),
  ]);
  const batches = asEventLogs(batchesRaw);
  const transfers = asEventLogs(transfersRaw);
  const relatedIds = new Set(batches.map((log) => bigint(log.args.batchId).toString()));
  const getTimestamp = await timestampsFor(client, batches.map((log) => log.blockNumber));
  return batches.map((log) => {
    const batchId = bigint(log.args.batchId).toString();
    const recipients = transfers
      .filter((item) => relatedIds.has(bigint(item.args.batchId).toString()) && bigint(item.args.batchId).toString() === batchId)
      .sort((a, b) => Number(bigint(a.args.index) - bigint(b.args.index)))
      .map((item) => ({ address: address(item.args.recipient), amount: formatEther(bigint(item.args.amount)) }));
    return {
      id: `${arcNetworkTestnet.id}:${log.transactionHash ?? 'bulk'}:${batchId}`,
      kind: 'bulk',
      timestamp: getTimestamp(log.blockNumber),
      status: 'confirmed',
      txHash: log.transactionHash,
      batchId,
      sender: address(log.args.sender),
      totalAmount: formatEther(bigint(log.args.totalAmount)),
      recipientCount: Number(bigint(log.args.recipientCount)),
      recipients,
    };
  });
}

const escrowEventNames = ['EscrowLocked', 'EscrowReleased', 'EscrowRefunded', 'EscrowDisputed', 'EvidenceSubmitted', 'DisputeResolved'] as const;
const gigEventNames = ['GigCreated', 'ProposalCreated', 'ProposalAccepted', 'ProposalWithdrawn', 'GigFunded', 'GigClosed'] as const;

async function loadEscrow(client: PublicClient, account: `0x${string}`): Promise<EscrowHistoryItem[]> {
  const records = await withRpcRetry(() => client.readContract({
    address: arcanumEscrowAddress,
    abi: arcanumEscrowAbi,
    functionName: 'getEscrowsFor',
    args: [account, 0n, 100n],
  })) as readonly EscrowRecord[];
  const escrowIds = new Set(records.map((record) => record.id.toString()));
  const gigIds = new Set(records.map((record) => record.gigId.toString()));
  const proposalIds = new Set(records.map((record) => record.proposalId.toString()));
  const recordById = new Map(records.map((record) => [record.id.toString(), record]));

  const [escrowGroups, gigGroups] = await Promise.all([
    Promise.all(escrowEventNames.map((eventName) => withRpcRetry(() => client.getContractEvents({
      address: arcanumEscrowAddress,
      abi: arcanumEscrowAbi,
      eventName,
      fromBlock: BigInt(arcTestnetDeployments.escrow.blockNumber),
      toBlock: 'latest',
    })))),
    Promise.all(gigEventNames.map((eventName) => withRpcRetry(() => client.getContractEvents({
      address: arcanumGigBoardAddress,
      abi: arcanumGigBoardAbi,
      eventName,
      fromBlock: BigInt(arcTestnetDeployments.gigBoard.blockNumber),
      toBlock: 'latest',
    })))),
  ]);

  const logs = [...escrowGroups, ...gigGroups].flatMap(asEventLogs).filter((log) => {
    const id = log.args.escrowId != null ? bigint(log.args.escrowId).toString() : '';
    const gigId = log.args.gigId != null ? bigint(log.args.gigId).toString() : '';
    const proposalId = log.args.proposalId != null ? bigint(log.args.proposalId).toString() : '';
    const participant = ['creator', 'proposer', 'payer', 'provider', 'arbiter', 'accepter', 'account', 'openedBy', 'author']
      .some((key) => String(log.args[key] ?? '').toLowerCase() === account.toLowerCase());
    return participant || escrowIds.has(id) || gigIds.has(gigId) || proposalIds.has(proposalId);
  });
  const getTimestamp = await timestampsFor(client, logs.map((log) => log.blockNumber));

  return logs.map((log) => {
    const escrowId = log.args.escrowId != null ? bigint(log.args.escrowId).toString() : undefined;
    const record = escrowId ? recordById.get(escrowId) : undefined;
    const actorValue = ['creator', 'proposer', 'accepter', 'account', 'openedBy', 'author', 'arbiter']
      .map((key) => log.args[key])
      .find(Boolean);
    const amountValue = log.args.amount != null ? bigint(log.args.amount) : record?.amount;
    const detailValue = log.args.evidenceURI ?? log.args.resolutionURI ?? log.args.resolutionHash;
    return {
      id: `${arcNetworkTestnet.id}:${log.transactionHash ?? log.blockNumber}:${log.eventName}:${log.logIndex ?? 0}`,
      kind: 'escrow',
      timestamp: getTimestamp(log.blockNumber),
      status: 'confirmed',
      txHash: log.transactionHash,
      action: log.eventName,
      escrowId,
      gigId: log.args.gigId != null ? bigint(log.args.gigId).toString() : record?.gigId.toString(),
      proposalId: log.args.proposalId != null ? bigint(log.args.proposalId).toString() : record?.proposalId.toString(),
      amount: amountValue != null ? formatEther(amountValue) : undefined,
      payer: log.args.payer ? address(log.args.payer) : record?.payer,
      provider: log.args.provider ? address(log.args.provider) : record?.provider,
      arbiter: log.args.arbiter ? address(log.args.arbiter) : record?.arbiter,
      actor: actorValue ? address(actorValue) : undefined,
      details: detailValue ? String(detailValue) : undefined,
    };
  });
}

async function loadSwaps(account: string, cursor?: string | null) {
  const url = new URL('/api/history/swaps', window.location.origin);
  url.searchParams.set('address', account);
  if (cursor) url.searchParams.set('cursor', cursor);
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error('ARCSCAN_UNAVAILABLE');
  return response.json() as Promise<{ items: SwapHistoryItem[]; nextCursor: string | null }>;
}

export default function ArcanumHistory({ language }: { language: Language }) {
  const t = copy[language];
  const { address: account, isConnected } = useAccount();
  const chainId = useChainId();
  const client = usePublicClient({ chainId: arcNetworkTestnet.id });
  const isCorrectChain = chainId === arcNetworkTestnet.id;
  const [tab, setTab] = useState<HistoryTab>('all');
  const [query, setQuery] = useState('');
  const [visible, setVisible] = useState(pageSize);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState('');
  const [swapCursor, setSwapCursor] = useState<string | null>(null);
  const [loadingMoreSwaps, setLoadingMoreSwaps] = useState(false);

  const refresh = useCallback(async () => {
    if (!client || !account || !isConnected || !isCorrectChain) return;
    setLoading(true);
    setWarning('');
    setVisible(pageSize);
    const localSwaps = readLocalSwapHistory(account);
    const [messagesResult, bulkResult, escrowResult, swaps] = await Promise.all([
      loadMessages(client, account).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: [] as MessageHistoryItem[], error })),
      loadBulk(client, account).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: [] as BulkHistoryItem[], error })),
      loadEscrow(client, account).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: [] as EscrowHistoryItem[], error })),
      loadSwaps(account).then((value) => ({ value, error: null })).catch((error: unknown) => ({ value: null, error })),
    ]);
    const next: HistoryItem[] = [...localSwaps];
    next.push(...messagesResult.value, ...bulkResult.value, ...escrowResult.value);
    if (swaps.value) {
      next.push(...swaps.value.items);
      setSwapCursor(swaps.value.nextCursor);
    } else {
      setSwapCursor(null);
    }
    const sourceError = messagesResult.error ?? bulkResult.error ?? escrowResult.error;
    if (swaps.error) setWarning(t.arcscanUnavailable);
    else if (sourceError) {
      setWarning(readableRpcError(sourceError, t.partial, t.rpcLimited));
    }
    setItems(sortAndDedupeHistory(next));
    setLoading(false);
  }, [account, client, isConnected, isCorrectChain, t.arcscanUnavailable, t.partial, t.rpcLimited]);

  useEffect(() => {
    setItems([]);
    setSwapCursor(null);
    if (isConnected && isCorrectChain && account) void refresh();
  }, [account, isConnected, isCorrectChain, refresh]);

  const filtered = useMemo(() => filterHistory(items, tab, query), [items, query, tab]);
  const displayed = filtered.slice(0, visible);
  const counts = useMemo(() => ({
    all: filterHistory(items, 'all').length,
    incoming: filterHistory(items, 'incoming').length,
    outgoing: filterHistory(items, 'outgoing').length,
    swap: filterHistory(items, 'swap').length,
    escrow: filterHistory(items, 'escrow').length,
    bulk: filterHistory(items, 'bulk').length,
  }), [items]);

  async function loadMore() {
    setVisible((current) => current + pageSize);
    if (!account || !swapCursor || (tab !== 'swap' && tab !== 'all')) return;
    setLoadingMoreSwaps(true);
    try {
      const response = await loadSwaps(account, swapCursor);
      setItems((current) => sortAndDedupeHistory([...current, ...response.items]));
      setSwapCursor(response.nextCursor);
    } catch {
      setWarning(t.arcscanUnavailable);
    } finally {
      setLoadingMoreSwaps(false);
    }
  }

  const tabs: Array<{ id: HistoryTab; icon: React.ReactNode }> = [
    { id: 'all', icon: <History size={15} /> },
    { id: 'incoming', icon: <Inbox size={15} /> },
    { id: 'outgoing', icon: <Send size={15} /> },
    { id: 'swap', icon: <ArrowDownLeft size={15} /> },
    { id: 'escrow', icon: <ShieldCheck size={15} /> },
    { id: 'bulk', icon: <Layers3 size={15} /> },
  ];

  return (
    <section className="panel min-h-[680px] overflow-hidden">
      <div className="panel-header gap-3">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 className="panel-title">{t.title}</h2>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={!isConnected || !isCorrectChain || loading} className="btn-ghost h-10 px-3">
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t.refresh}
        </button>
      </div>

      <div className="segmented-control mt-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setTab(item.id);
              setVisible(pageSize);
            }}
            className={`segment-option px-2 text-xs ${tab === item.id ? 'segment-option-active' : ''}`}
            aria-pressed={tab === item.id}
          >
            {item.icon}
            <span>{t.tabs[item.id]}</span>
            <span className="rounded-full bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <label className="relative mt-4 block">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.search} className="input w-full pl-10" />
      </label>

      {!isConnected ? <Notice>{t.disconnected}</Notice> : null}
      {isConnected && !isCorrectChain ? <Notice>{t.wrongNetwork}</Notice> : null}
      {loading ? <Notice>{t.loading}</Notice> : null}
      {warning && (tab === 'all' || (warning === t.arcscanUnavailable && tab === 'swap') || warning !== t.arcscanUnavailable) ? <Notice tone="warning">{warning}</Notice> : null}
      {!loading && isConnected && isCorrectChain && filtered.length === 0 ? <Notice>{t.empty}</Notice> : null}

      <div className="mt-4 grid gap-3">
        {displayed.map((item) => (
          <HistoryCard key={item.id} item={item} account={account} language={language} t={t} />
        ))}
      </div>

      {visible < filtered.length || ((tab === 'all' || tab === 'swap') && swapCursor) ? (
        <div className="mt-5 flex justify-center">
          <button type="button" onClick={() => void loadMore()} disabled={loadingMoreSwaps} className="btn-ghost h-10 px-4">
            <ChevronDown size={16} />
            {t.loadMore}
            <span className="text-zinc-500">{Math.min(visible, filtered.length)}/{filtered.length}</span>
          </button>
        </div>
      ) : null}
    </section>
  );
}

function HistoryCard({ item, account, language, t }: { item: HistoryItem; account?: `0x${string}`; language: Language; t: HistoryCopy }) {
  const [expanded, setExpanded] = useState(false);
  const txUrl = item.txHash ? transactionUrl(item.txHash) : undefined;
  return (
    <article className="chat-card p-4 [content-visibility:auto]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="text-accent mt-0.5 rounded-lg border border-zinc-800 bg-zinc-950 p-2">
            {item.kind === 'message' ? (item.direction === 'incoming' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />) : item.kind === 'swap' ? <ArrowDownLeft size={16} /> : item.kind === 'escrow' ? <ShieldCheck size={16} /> : <Layers3 size={16} />}
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-100"><CardTitle item={item} t={t} /></h3>
            <p className="mt-1 text-xs text-zinc-500">{formatTimestamp(item.timestamp, language)}</p>
          </div>
        </div>
        <span className={`rounded-full border px-2 py-1 text-[11px] ${item.status === 'confirmed' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : item.status === 'failed' ? 'border-red-400/20 bg-red-400/10 text-red-300' : 'border-amber-300/20 bg-amber-300/10 text-amber-200'}`}>
          {t.statuses[item.status]}
        </span>
      </div>

      <div className="mt-4">
        {item.kind === 'message' ? <MessageDetails item={item} account={account} t={t} /> : null}
        {item.kind === 'swap' ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <Detail label={t.amount} value={`${item.amountIn} ${item.tokenIn}`} />
            <Detail label={t.received} value={`${item.amountOut} ${item.tokenOut}`} />
            {item.minimumOut ? <Detail label={t.minimum} value={`${item.minimumOut} ${item.tokenOut}`} /> : null}
            {item.fees?.length ? <Detail label={t.fees} value={item.fees.join(' · ')} /> : null}
          </div>
        ) : null}
        {item.kind === 'escrow' ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            {item.escrowId ? <Detail label="Escrow ID" value={`#${item.escrowId}`} /> : null}
            {item.gigId ? <Detail label="Gig ID" value={`#${item.gigId}`} /> : null}
            {item.proposalId ? <Detail label="Proposal ID" value={`#${item.proposalId}`} /> : null}
            {item.amount ? <Detail label={t.amount} value={`${item.amount} USDC`} /> : null}
            <Detail label={t.roles} value={[item.payer && `Payer ${short(item.payer)}`, item.provider && `Provider ${short(item.provider)}`, item.arbiter && `Arbiter ${short(item.arbiter)}`].filter(Boolean).join(' · ') || short(item.actor ?? '')} />
            {item.details ? <Detail label="Details" value={item.details} /> : null}
          </div>
        ) : null}
        {item.kind === 'bulk' ? (
          <div>
            <div className="grid gap-2 text-sm sm:grid-cols-3">
              <Detail label="Batch ID" value={`#${item.batchId}`} />
              <Detail label={t.amount} value={`${item.totalAmount} USDC`} />
              <Detail label={t.recipients} value={String(item.recipientCount)} />
            </div>
            {item.recipients.length ? (
              <>
                <button type="button" onClick={() => setExpanded((value) => !value)} className="text-accent mt-3 flex items-center gap-2 text-xs font-medium">
                  {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {expanded ? t.hideRecipients : t.showRecipients}
                </button>
                {expanded ? (
                  <div className="mt-3 grid gap-2">
                    {item.recipients.map((entry, index) => (
                      <div key={`${entry.address}-${index}`} className="flex flex-col justify-between gap-1 rounded-md bg-zinc-950 px-3 py-2 text-xs sm:flex-row">
                        <span className="break-all font-mono text-zinc-400">{entry.address}</span>
                        <span className="font-medium text-zinc-200">{entry.amount} USDC</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {txUrl ? (
        <a href={txUrl} target="_blank" rel="noreferrer" className="text-accent mt-4 inline-flex items-center gap-2 text-xs font-medium">
          {t.viewTransaction}
          <ExternalLink size={13} />
        </a>
      ) : null}
    </article>
  );
}

function CardTitle({ item, t }: { item: HistoryItem; t: HistoryCopy }) {
  if (item.kind === 'message') return <>{item.channel === 'agent' ? t.agent : t.direct} · {item.direction === 'incoming' ? t.incoming : t.outgoing}</>;
  if (item.kind === 'swap') return <>{item.tokenIn} → {item.tokenOut}</>;
  if (item.kind === 'escrow') return <>{item.action}</>;
  return <>Bulk Sender · #{item.batchId}</>;
}

function MessageDetails({ item, account, t }: { item: MessageHistoryItem; account?: `0x${string}`; t: HistoryCopy }) {
  const [content, setContent] = useState(item.isPrivate ? '' : item.payload);
  const [failure, setFailure] = useState<'locked' | 'decrypt' | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!item.isPrivate || !account) {
      setContent(item.isPrivate ? '' : item.payload);
      setFailure(null);
      return;
    }
    decryptMessage(item.payload, account).then((value) => {
      if (!cancelled) {
        setContent(value);
        setFailure(null);
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      const code = error instanceof Error ? error.message : '';
      setContent('');
      setFailure(['NO_LOCAL_KEY', 'LOCAL_KEY_LOCKED', 'LOCAL_KEY_REQUIRES_MIGRATION'].includes(code) ? 'locked' : 'decrypt');
    });
    return () => {
      cancelled = true;
    };
  }, [account, item.isPrivate, item.payload]);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full border border-zinc-800 px-2 py-1 text-[11px] text-zinc-400">
          {item.isPrivate ? <Lock size={11} className="mr-1 inline" /> : null}{item.isPrivate ? t.private : t.public}
        </span>
        {item.paymentAmount && item.paymentAmount !== '0' ? <span className="rounded-full border border-emerald-400/20 px-2 py-1 text-[11px] text-emerald-300">{t.payment}: {item.paymentAmount} USDC</span> : null}
      </div>
      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{content || (failure === 'locked' ? t.locked : failure === 'decrypt' ? t.decryptFailed : '')}</p>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <Detail label={t.from} value={item.sender} mono />
        <Detail label={t.to} value={item.recipient} mono />
      </div>
    </div>
  );
}

function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="rounded-md bg-zinc-950 px-3 py-2">
      <span className="text-[11px] uppercase tracking-wide text-zinc-600">{label}</span>
      <p className={`mt-1 break-all text-xs text-zinc-300 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function Notice({ children, tone = 'default' }: { children: React.ReactNode; tone?: 'default' | 'warning' }) {
  return <p className={`mt-4 rounded-lg border px-4 py-3 text-sm ${tone === 'warning' ? 'border-amber-300/20 bg-amber-300/10 text-amber-200' : 'border-zinc-800 bg-zinc-950 text-zinc-500'}`}>{children}</p>;
}
