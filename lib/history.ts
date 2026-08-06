import { formatUnits } from 'viem';

import { arcSwapChainId, arcSwapTokens, type SwapTokenSymbol } from './circleSwap';

export type HistoryTab = 'all' | 'incoming' | 'outgoing' | 'swap' | 'bridge' | 'escrow' | 'bulk';
export type HistoryStatus = 'confirmed' | 'pending' | 'failed' | 'estimated';

type HistoryBase = {
  id: string;
  kind: 'message' | 'swap' | 'bridge' | 'escrow' | 'bulk';
  timestamp: number;
  status: HistoryStatus;
  txHash?: `0x${string}`;
};

export type MessageHistoryItem = HistoryBase & {
  kind: 'message';
  channel: 'direct' | 'agent';
  direction: 'incoming' | 'outgoing';
  messageId: string;
  sender: `0x${string}`;
  recipient: `0x${string}`;
  payload: string;
  isPrivate: boolean;
  paymentAmount?: string;
};

export type SwapHistoryItem = HistoryBase & {
  kind: 'swap';
  tokenIn: SwapTokenSymbol;
  tokenOut: SwapTokenSymbol;
  amountIn: string;
  amountOut: string;
  minimumOut?: string;
  fees?: string[];
  source: 'chain' | 'local';
};

export type BridgeHistoryStep = {
  name: string;
  state: string;
  txHash?: `0x${string}`;
  explorerUrl?: string;
  forwarded?: boolean;
  batched?: boolean;
  errorMessage?: string;
};

export type BridgeHistoryItem = HistoryBase & {
  kind: 'bridge';
  bridgeId: string;
  account: `0x${string}`;
  amount: string;
  sourceChain: string;
  sourceChainId: number;
  destinationChain: string;
  destinationChainId: number;
  provider?: string;
  fees?: string[];
  steps: BridgeHistoryStep[];
};

export type EscrowHistoryItem = HistoryBase & {
  kind: 'escrow';
  action: string;
  escrowId?: string;
  gigId?: string;
  proposalId?: string;
  amount?: string;
  payer?: `0x${string}`;
  provider?: `0x${string}`;
  arbiter?: `0x${string}`;
  actor?: `0x${string}`;
  details?: string;
};

export type BulkHistoryItem = HistoryBase & {
  kind: 'bulk';
  batchId: string;
  sender: `0x${string}`;
  totalAmount: string;
  recipientCount: number;
  recipients: Array<{ address: `0x${string}`; amount: string }>;
};

export type HistoryItem =
  | MessageHistoryItem
  | SwapHistoryItem
  | BridgeHistoryItem
  | EscrowHistoryItem
  | BulkHistoryItem;

export type LocalSwapHistoryRecord = Omit<SwapHistoryItem, 'id' | 'kind' | 'source'> & {
  chainId: number;
  address: `0x${string}`;
};

const localHistoryPrefix = 'arcanum.history.v1';
const localBridgeHistoryPrefix = 'arcanum.bridge.history.v1';

export function swapHistoryStorageKey(chainId: number, address: string) {
  return `${localHistoryPrefix}:${chainId}:${address.toLowerCase()}`;
}
export function localSwapToItem(record: LocalSwapHistoryRecord): SwapHistoryItem {
  return {
    ...record,
    id: `${record.chainId}:${record.txHash ?? `local-${record.timestamp}`}:swap`,
    kind: 'swap',
    source: 'local',
  };
}

export function readLocalSwapHistory(address: string): SwapHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(swapHistoryStorageKey(arcSwapChainId, address));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LocalSwapHistoryRecord => (
        item
        && item.chainId === arcSwapChainId
        && String(item.address).toLowerCase() === address.toLowerCase()
        && typeof item.timestamp === 'number'
        && (item.tokenIn === 'USDC' || item.tokenIn === 'EURC')
        && (item.tokenOut === 'USDC' || item.tokenOut === 'EURC')
      ))
      .map(localSwapToItem);
  } catch {
    return [];
  }
}

export function saveLocalSwapHistory(record: LocalSwapHistoryRecord) {
  if (typeof window === 'undefined') return;
  const key = swapHistoryStorageKey(record.chainId, record.address);
  let records: LocalSwapHistoryRecord[] = [];
  try {
    const current = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (Array.isArray(current)) records = current;
  } catch {
    records = [];
  }
  const hash = record.txHash?.toLowerCase();
  const next = [record, ...records.filter((item) => item.txHash?.toLowerCase() !== hash)].slice(0, 100);
  window.localStorage.setItem(key, JSON.stringify(next));
}

export function updateLocalSwapStatus(address: string, txHash: string, status: HistoryStatus) {
  if (typeof window === 'undefined') return;
  const key = swapHistoryStorageKey(arcSwapChainId, address);
  try {
    const current = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (!Array.isArray(current)) return;
    const next = current.map((item) => (
      item?.txHash?.toLowerCase() === txHash.toLowerCase() ? { ...item, status } : item
    ));
    window.localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // Corrupt local history must never block the swap flow.
  }
}

export type LocalBridgeHistoryRecord = Omit<BridgeHistoryItem, 'id' | 'kind'>;

export function bridgeHistoryStorageKey(address: string) {
  return `${localBridgeHistoryPrefix}:${address.toLowerCase()}`;
}

export function localBridgeToItem(record: LocalBridgeHistoryRecord): BridgeHistoryItem {
  return {
    ...record,
    id: `bridge:${record.bridgeId}`,
    kind: 'bridge',
  };
}

export function readLocalBridgeHistory(address: string): BridgeHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(bridgeHistoryStorageKey(address));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is LocalBridgeHistoryRecord => (
        item
        && typeof item.bridgeId === 'string'
        && String(item.account).toLowerCase() === address.toLowerCase()
        && typeof item.timestamp === 'number'
        && typeof item.amount === 'string'
        && typeof item.sourceChain === 'string'
        && typeof item.destinationChain === 'string'
        && Array.isArray(item.steps)
      ))
      .map(localBridgeToItem);
  } catch {
    return [];
  }
}

export function saveLocalBridgeHistory(record: LocalBridgeHistoryRecord) {
  if (typeof window === 'undefined') return;
  const key = bridgeHistoryStorageKey(record.account);
  let records: LocalBridgeHistoryRecord[] = [];
  try {
    const current = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    if (Array.isArray(current)) records = current;
  } catch {
    records = [];
  }
  const next = [
    record,
    ...records.filter((item) => item.bridgeId !== record.bridgeId),
  ].slice(0, 100);
  window.localStorage.setItem(key, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('arcanum:bridge-history-updated', {
    detail: { address: record.account },
  }));
}

export function historyIdentity(item: HistoryItem) {
  if (item.kind === 'bridge') return `bridge:${item.bridgeId}`;
  if (item.txHash) {
    const suffix = item.kind === 'message'
      ? item.messageId
      : item.kind === 'escrow'
        ? `${item.action}:${item.escrowId ?? item.proposalId ?? item.gigId ?? ''}`
        : item.kind === 'bulk'
          ? item.batchId
          : 'swap';
    return `${arcSwapChainId}:${item.txHash.toLowerCase()}:${suffix}`;
  }
  return item.id;
}

export function sortAndDedupeHistory(items: HistoryItem[]) {
  const unique = new Map<string, HistoryItem>();
  for (const item of items) {
    const key = historyIdentity(item);
    const existing = unique.get(key);
    if (
      !existing
      || (existing.kind === 'swap' && existing.source === 'local' && item.kind === 'swap' && item.source === 'chain')
      || (existing.kind === 'bridge' && item.kind === 'bridge' && item.timestamp >= existing.timestamp)
    ) {
      unique.set(key, item);
    }
  }
  return [...unique.values()].sort((a, b) => b.timestamp - a.timestamp);
}

export function filterHistory(items: HistoryItem[], tab: HistoryTab, query = '') {
  const normalized = query.trim().toLowerCase();
  return items.filter((item) => {
    const inTab = tab === 'all'
      || (tab === 'incoming' && item.kind === 'message' && item.direction === 'incoming')
      || (tab === 'outgoing' && item.kind === 'message' && item.direction === 'outgoing')
      || tab === item.kind;
    if (!inTab) return false;
    if (!normalized) return true;
    return historySearchText(item).includes(normalized);
  });
}

function historySearchText(item: HistoryItem) {
  const common = `${item.id} ${item.txHash ?? ''} ${item.status}`;
  if (item.kind === 'message') {
    return `${common} ${item.channel} ${item.direction} ${item.sender} ${item.recipient} ${item.isPrivate ? '' : item.payload}`.toLowerCase();
  }
  if (item.kind === 'swap') {
    return `${common} ${item.tokenIn} ${item.tokenOut} ${item.amountIn} ${item.amountOut}`.toLowerCase();
  }
  if (item.kind === 'bridge') {
    return `${common} ${item.bridgeId} ${item.account} ${item.amount} ${item.sourceChain} ${item.destinationChain} ${item.provider ?? ''} ${item.steps.map((step) => `${step.name} ${step.state} ${step.txHash ?? ''}`).join(' ')}`.toLowerCase();
  }
  if (item.kind === 'bulk') {
    return `${common} ${item.batchId} ${item.sender} ${item.totalAmount} ${item.recipients.map((entry) => `${entry.address} ${entry.amount}`).join(' ')}`.toLowerCase();
  }
  return `${common} ${item.action} ${item.escrowId ?? ''} ${item.gigId ?? ''} ${item.proposalId ?? ''} ${item.amount ?? ''} ${item.payer ?? ''} ${item.provider ?? ''} ${item.arbiter ?? ''} ${item.actor ?? ''} ${item.details ?? ''}`.toLowerCase();
}

type TokenTransfer = {
  transaction_hash: string;
  timestamp: string;
  from: { hash: string };
  to: { hash: string };
  total: { value: string; decimals: string };
  token: { address_hash: string; symbol?: string };
};

export function netArcSwapTransfers(transfers: TokenTransfer[], address: string): SwapHistoryItem[] {
  const account = address.toLowerCase();
  const tokens = new Map(Object.values(arcSwapTokens).map((token) => [token.address.toLowerCase(), token.symbol]));
  const transactions = new Map<string, { timestamp: number; deltas: Map<SwapTokenSymbol, bigint> }>();

  for (const transfer of transfers) {
    const symbol = tokens.get(transfer.token.address_hash.toLowerCase());
    if (!symbol) continue;
    const hash = transfer.transaction_hash.toLowerCase();
    const entry = transactions.get(hash) ?? {
      timestamp: Date.parse(transfer.timestamp) || Date.now(),
      deltas: new Map<SwapTokenSymbol, bigint>(),
    };
    const value = BigInt(transfer.total.value);
    const current = entry.deltas.get(symbol) ?? 0n;
    if (transfer.from.hash.toLowerCase() === account) entry.deltas.set(symbol, current - value);
    if (transfer.to.hash.toLowerCase() === account) entry.deltas.set(symbol, (entry.deltas.get(symbol) ?? 0n) + value);
    transactions.set(hash, entry);
  }

  const result: SwapHistoryItem[] = [];
  for (const [hash, entry] of transactions) {
    const input = [...entry.deltas].find(([, value]) => value < 0n);
    const output = [...entry.deltas].find(([, value]) => value > 0n);
    if (!input || !output || input[0] === output[0]) continue;
    result.push({
      id: `${arcSwapChainId}:${hash}:swap`,
      kind: 'swap',
      timestamp: entry.timestamp,
      status: 'confirmed',
      txHash: hash as `0x${string}`,
      tokenIn: input[0],
      tokenOut: output[0],
      amountIn: formatUnits(-input[1], 6),
      amountOut: formatUnits(output[1], 6),
      source: 'chain',
    });
  }
  return sortAndDedupeHistory(result) as SwapHistoryItem[];
}
