'use client';

import { FormEvent, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardPaste,
  Coins,
  ExternalLink,
  History,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from 'lucide-react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { formatUnits, maxUint256, zeroAddress, type Hex } from 'viem';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import {
  arcUsdcAbi,
  arcUsdcAddress,
  arcanumBulkAbi,
  arcanumBulkAddress,
  bulkBatchFee,
  bulkBatchFeeLabel,
  isArcanumBulkConfigured,
  maxBulkRecipients,
  type BulkBatch,
} from '../lib/bulkContract';
import { parseBulkPaste, prepareBulkRows, type BulkDraftRow } from '../lib/bulkUtils';
import type { Language } from './arcanumCopy';

const text = {
  en: {
    title: 'Bulk Sender', subtitle: 'One public message and different USDC amounts in one atomic batch.', recipient: 'Recipient address', amount: 'USDC amount',
    add: 'Add recipient', paste: 'Paste address,amount rows', pasteHint: 'One row per line: 0xAddress,12.50', apply: 'Apply rows', message: 'Public batch message',
    approve: 'Approve ArcanumBulk', approving: 'Approving...', send: 'Send atomic batch', wallet: 'Waiting for wallet confirmation...', confirmed: 'Transaction confirmed.',
    total: 'Total transfer', fee: 'Platform fee', balance: 'USDC balance', allowance: 'Allowance', rows: 'Recipients', public: 'Public and permanent on-chain message.',
    atomic: 'Atomic protection: if one recipient fails, every transfer and the fee revert.', sent: 'Sent batches', received: 'Received batches', empty: 'No batch history yet.',
    invalid: 'Check recipient addresses, duplicates, and amounts with at most 6 decimals.', messageRequired: 'A public message is required and must be at most 4,096 bytes.',
    unavailable: 'Bulk contract is not configured yet.', disconnected: 'Connect your wallet and switch to Arc Testnet.', insufficient: 'Insufficient USDC balance for this batch.',
  },
  tr: {
    title: 'Bulk Sender', subtitle: 'Tek atomik batch içinde ortak public mesaj ve farklı USDC tutarları.', recipient: 'Alıcı adresi', amount: 'USDC tutarı',
    add: 'Alıcı ekle', paste: 'address,amount satırlarını yapıştır', pasteHint: 'Her satır: 0xAdres,12.50', apply: 'Satırları uygula', message: 'Public batch mesajı',
    approve: 'ArcanumBulk approve et', approving: 'Approve ediliyor...', send: 'Atomik batch gönder', wallet: 'Cüzdan onayı bekleniyor...', confirmed: 'İşlem onaylandı.',
    total: 'Toplam transfer', fee: 'Platform ücreti', balance: 'USDC bakiye', allowance: 'Allowance', rows: 'Alıcılar', public: 'Mesaj public ve on-chain kalıcıdır.',
    atomic: 'Atomik koruma: tek alıcı başarısızsa tüm transferler ve ücret geri alınır.', sent: 'Gönderilen batchler', received: 'Alınan batchler', empty: 'Henüz batch geçmişi yok.',
    invalid: 'Adresleri, tekrar eden alıcıları ve en fazla 6 ondalıklı tutarları kontrol et.', messageRequired: 'Public mesaj zorunludur ve en fazla 4.096 byte olabilir.',
    unavailable: 'Bulk kontratı henüz yapılandırılmadı.', disconnected: 'Cüzdanını bağla ve Arc Testnet ağına geç.', insufficient: 'Bu batch için USDC bakiye yetersiz.',
  },
} as const;

type DraftRow = BulkDraftRow & { id: string };
type HistoryTab = 'sent' | 'received';

function createRow(id = `row-${Date.now()}-${Math.random()}`): DraftRow {
  return { id, recipient: '', amount: '' };
}

function short(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function readableError(error: unknown) {
  const value = error instanceof Error ? error.message : String(error ?? '');
  const match = value.match(/reverted with reason string '([^']+)'/);
  return match?.[1] ?? value;
}

export function BulkSender({ language }: { language: Language }) {
  const copy = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const connectedAddress = address ?? zeroAddress;
  const enabled = isConnected && chainId === arcNetworkTestnet.id && isArcanumBulkConfigured;

  const [rows, setRows] = useState<DraftRow[]>([createRow('row-initial')]);
  const [pasteValue, setPasteValue] = useState('');
  const [message, setMessage] = useState('');
  const [historyTab, setHistoryTab] = useState<HistoryTab>('sent');
  const [pendingAction, setPendingAction] = useState<'approve' | 'send' | ''>('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [lastHash, setLastHash] = useState<Hex>();

  const balanceRead = useReadContract({
    address: arcUsdcAddress,
    abi: arcUsdcAbi,
    functionName: 'balanceOf',
    args: [connectedAddress],
    query: { enabled },
  });
  const allowanceRead = useReadContract({
    address: arcUsdcAddress,
    abi: arcUsdcAbi,
    functionName: 'allowance',
    args: [connectedAddress, arcanumBulkAddress],
    query: { enabled },
  });
  const sentIdsRead = useReadContract({
    address: arcanumBulkAddress,
    abi: arcanumBulkAbi,
    functionName: 'getSentBatchIdsPage',
    args: [connectedAddress, 0n, 100n],
    query: { enabled },
  });
  const receivedIdsRead = useReadContract({
    address: arcanumBulkAddress,
    abi: arcanumBulkAbi,
    functionName: 'getReceivedBatchIdsPage',
    args: [connectedAddress, 0n, 100n],
    query: { enabled },
  });

  const balance = (balanceRead.data ?? 0n) as bigint;
  const allowance = (allowanceRead.data ?? 0n) as bigint;
  const sentIds = (sentIdsRead.data ?? []) as readonly bigint[];
  const receivedIds = (receivedIdsRead.data ?? []) as readonly bigint[];
  const historyIds = historyTab === 'sent' ? sentIds : receivedIds;
  const historyReads = useReadContracts({
    contracts: historyIds.map((batchId) => ({
      address: arcanumBulkAddress,
      abi: arcanumBulkAbi,
      functionName: 'getBatch',
      args: [batchId],
    } as const)),
    query: { enabled: enabled && historyIds.length > 0 },
  });
  const batches = useMemo(() => historyIds.flatMap((batchId, index): BulkBatch[] => {
    const batch = historyReads.data?.[index]?.result as BulkBatch | undefined;
    return batch ? [batch] : [];
  }).sort((left, right) => Number(right.id - left.id)), [historyIds, historyReads.data]);

  const prepared = useMemo(() => {
    try {
      return { value: prepareBulkRows(rows, address, maxBulkRecipients), error: '' };
    } catch (caught) {
      return { value: null, error: readableError(caught) };
    }
  }, [address, rows]);
  const messageBytes = new TextEncoder().encode(message.trim()).length;
  const messageValid = messageBytes > 0 && messageBytes <= 4096;
  const hasBalance = Boolean(prepared.value && balance >= prepared.value.totalAmount);
  const needsApproval = Boolean(prepared.value && allowance < prepared.value.totalAmount);

  async function refresh() {
    await Promise.all([
      balanceRead.refetch(), allowanceRead.refetch(), sentIdsRead.refetch(), receivedIdsRead.refetch(), historyReads.refetch(),
    ]);
  }

  async function execute(kind: 'approve' | 'send', action: () => Promise<Hex>, after?: () => void) {
    if (!publicClient) return;
    setPendingAction(kind);
    setStatus(copy.wallet);
    setError('');
    try {
      const hash = await action();
      setLastHash(hash);
      await publicClient.waitForTransactionReceipt({ hash });
      setStatus(copy.confirmed);
      after?.();
      await refresh();
    } catch (caught) {
      setStatus('');
      setError(readableError(caught));
    } finally {
      setPendingAction('');
    }
  }

  function updateRow(id: string, field: 'recipient' | 'amount', value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [field]: value } : row));
  }

  function applyPaste() {
    try {
      const parsed = parseBulkPaste(pasteValue);
      if (parsed.length > maxBulkRecipients) throw new Error('BULK_TOO_MANY_RECIPIENTS');
      setRows(parsed.map((row, index) => ({ ...row, id: `paste-${index}-${row.recipient.toLowerCase()}` })));
      setPasteValue('');
      setError('');
    } catch (caught) {
      setError(readableError(caught));
    }
  }

  function approve() {
    void execute('approve', () => writeContractAsync({
      address: arcUsdcAddress,
      abi: arcUsdcAbi,
      functionName: 'approve',
      args: [arcanumBulkAddress, maxUint256],
    }));
  }

  function submitBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prepared.value || !messageValid || needsApproval || !hasBalance) return;
    const payload = prepared.value;
    void execute('send', () => writeContractAsync({
      address: arcanumBulkAddress,
      abi: arcanumBulkAbi,
      functionName: 'bulkSend',
      args: [payload.recipients, payload.amounts, message.trim()],
      value: bulkBatchFee,
    }), () => {
      setRows([createRow()]);
      setMessage('');
    });
  }

  if (!isArcanumBulkConfigured) return <Notice title={copy.title} body={copy.unavailable} />;
  if (!enabled) return <Notice title={copy.title} body={copy.disconnected} />;

  return (
    <section className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
      <form onSubmit={submitBatch} className="panel min-w-0">
        <div className="panel-header">
          <div><p className="eyebrow">USDC Batch</p><h2 className="panel-title">{copy.title}</h2><p className="mt-2 text-sm text-zinc-500">{copy.subtitle}</p></div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-xs text-sky-200"><ShieldCheck size={13} />Atomic</span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={copy.balance} value={`${formatUnits(balance, 6)} USDC`} />
          <Metric label={copy.allowance} value={allowance === maxUint256 ? 'Unlimited' : `${formatUnits(allowance, 6)} USDC`} />
          <Metric label={copy.total} value={`${formatUnits(prepared.value?.totalAmount ?? 0n, 6)} USDC`} />
          <Metric label={copy.fee} value={bulkBatchFeeLabel} />
        </div>

        <div className="mt-5 rounded-lg border border-zinc-800 bg-black/20 p-3">
          <div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-zinc-200">{copy.rows} ({rows.length}/{maxBulkRecipients})</p><Users size={16} className="text-zinc-500" /></div>
          <div className="mt-3 grid gap-2">
            {rows.map((row, index) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[36px_minmax(0,1fr)_160px_40px] sm:items-center">
                <span className="hidden text-center text-xs text-zinc-600 sm:block">{index + 1}</span>
                <input value={row.recipient} onChange={(event) => updateRow(row.id, 'recipient', event.target.value)} className="input font-mono text-xs" placeholder={copy.recipient} />
                <input value={row.amount} onChange={(event) => updateRow(row.id, 'amount', event.target.value)} className="input" placeholder={copy.amount} inputMode="decimal" />
                <button type="button" onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} disabled={rows.length === 1} className="btn-ghost h-10 w-10" aria-label="Remove row"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((current) => current.length < maxBulkRecipients ? [...current, createRow()] : current)} className="btn-ghost mt-3 h-9 px-3"><Plus size={14} />{copy.add}</button>
        </div>

        <details className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          <summary className="cursor-pointer text-sm font-medium text-zinc-300"><ClipboardPaste size={15} className="mr-2 inline" />{copy.paste}</summary>
          <textarea value={pasteValue} onChange={(event) => setPasteValue(event.target.value)} className="input mt-3 min-h-28 resize-y py-3 font-mono text-xs" placeholder={copy.pasteHint} />
          <button type="button" onClick={applyPaste} disabled={!pasteValue.trim()} className="btn-ghost mt-2 h-9 px-3">{copy.apply}</button>
        </details>

        <label className="mt-4 grid gap-2">
          <span className="text-xs font-medium text-zinc-500">{copy.message}</span>
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} className="input min-h-28 resize-y py-3" placeholder={copy.message} />
          <span className="flex justify-between gap-3 text-xs text-zinc-500"><span>{copy.public}</span><span>{messageBytes}/4096 bytes</span></span>
        </label>

        {prepared.error ? <p className="helper-warning mt-3">{copy.invalid} <span className="font-mono text-xs">({prepared.error})</span></p> : null}
        {!messageValid ? <p className="helper-warning mt-3">{copy.messageRequired}</p> : null}
        {prepared.value && !hasBalance ? <p className="helper-danger mt-3">{copy.insufficient}</p> : null}
        <p className="mt-3 rounded-md border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-sm text-sky-100">{copy.atomic}</p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
          {needsApproval ? (
            <button type="button" onClick={approve} disabled={!prepared.value || Boolean(pendingAction)} className="btn-ghost h-11 px-5"><Coins size={17} />{pendingAction === 'approve' ? copy.approving : copy.approve}</button>
          ) : null}
          <button type="submit" disabled={!prepared.value || !messageValid || needsApproval || !hasBalance || Boolean(pendingAction)} className="btn-primary h-11 px-5"><Send size={17} />{copy.send}</button>
        </div>

        {(status || error || lastHash) ? (
          <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${error ? 'border-red-400/30 bg-red-400/10 text-red-200' : 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'}`}>
            <p className="break-words">{error || status}</p>
            {lastHash ? <a href={transactionUrl(lastHash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-200 underline">ArcScan <ExternalLink size={12} /></a> : null}
          </div>
        ) : null}
      </form>

      <aside className="panel min-w-0">
        <div className="panel-header">
          <div><p className="eyebrow">History</p><h2 className="panel-title">Batch history</h2></div>
          <button type="button" onClick={() => void refresh()} className="btn-ghost h-10 w-10" aria-label="Refresh"><RefreshCw size={16} /></button>
        </div>
        <div className="mt-4 grid grid-cols-2 rounded-lg border border-zinc-800 bg-zinc-950 p-1">
          <button type="button" onClick={() => setHistoryTab('sent')} className={`h-10 rounded-md text-sm ${historyTab === 'sent' ? 'bg-white text-zinc-950' : 'text-zinc-400'}`}>{copy.sent}</button>
          <button type="button" onClick={() => setHistoryTab('received')} className={`h-10 rounded-md text-sm ${historyTab === 'received' ? 'bg-white text-zinc-950' : 'text-zinc-400'}`}>{copy.received}</button>
        </div>
        <div className="mt-4 grid gap-3">
          {batches.length === 0 ? <p className="text-sm text-zinc-500">{copy.empty}</p> : null}
          {batches.map((batch) => (
            <article key={batch.id.toString()} className="chat-card p-4">
              <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-xs text-emerald-200"><CheckCircle2 size={14} />Batch #{batch.id.toString()}</span><span className="text-xs text-zinc-500">{batch.recipientCount.toString()} recipients</span></div>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-zinc-200">{batch.message}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-zinc-500">
                <span>{formatUnits(batch.totalAmount, 6)} USDC</span><span className="text-right">{short(batch.sender)}</span>
                <span className="col-span-2">{new Date(Number(batch.timestamp) * 1000).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}</span>
              </div>
            </article>
          ))}
        </div>
      </aside>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2"><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-1 truncate font-mono text-xs text-zinc-200">{value}</p></div>;
}

function Notice({ title, body }: { title: string; body: string }) {
  return <section className="panel min-h-[560px]"><p className="eyebrow">USDC Batch</p><h2 className="panel-title">{title}</h2><p className="mt-4 text-sm text-zinc-500">{body}</p><History size={18} className="mt-5 text-zinc-700" /></section>;
}
