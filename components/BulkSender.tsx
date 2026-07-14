'use client';

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, FileUp, Loader2, Plus, Send, Trash2, WalletCards, X } from 'lucide-react';
import { formatEther, isAddress, parseEther } from 'viem';
import { useAccount, useBalance, useChainId, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from 'wagmi';
import { arcNetworkTestnet, transactionUrl } from '../lib/chain';
import { arcanumBulkSenderAbi, arcanumBulkSenderAddress, isArcanumBulkSenderConfigured } from '../lib/bulkContract';
import type { Language } from './arcanumCopy';

type Row = { id: number; address: string; amount: string };
type PreparedRow = { address: `0x${string}`; amount: bigint };

const text = {
  en: {
    eyebrow: 'USDC batch', title: 'Bulk Sender', body: 'Send Arc native USDC to up to 100 recipients in one atomic transaction.',
    notConfigured: 'Bulk contract is not configured yet.', noWallet: 'Connect your wallet to prepare a batch.', wrongChain: 'Switch to Arc Testnet to send native USDC.',
    recipient: 'Recipient', amount: 'USDC amount', add: 'Add recipient', import: 'Import CSV', paste: 'Paste address,amount rows',
    apply: 'Apply rows', total: 'Batch total', balance: 'Wallet balance', recipients: 'Recipients', review: 'Review batch',
    reviewTitle: 'Confirm atomic batch', atomic: 'If one recipient rejects the transfer, the complete transaction is reverted.',
    gas: 'Estimated gas', confirm: 'Continue in wallet', cancel: 'Cancel', pending: 'Transaction pending…', confirmed: 'Batch confirmed.',
    failed: 'Batch failed', invalid: 'Fix invalid addresses or amounts before continuing.', insufficient: 'Wallet balance is lower than batch total plus estimated gas.',
    duplicate: 'Duplicate addresses were merged into one recipient total.', tooMany: 'A batch can contain at most 100 recipient rows.', explorer: 'Explorer', clear: 'Clear', close: 'Close',
  },
  tr: {
    eyebrow: 'USDC batch', title: 'Toplu Gönderici', body: 'Arc native USDC’yi en fazla 100 alıcıya tek ve atomik işlemle gönderin.',
    notConfigured: 'Bulk contract adresi henüz yapılandırılmadı.', noWallet: 'Batch hazırlamak için cüzdanınızı bağlayın.', wrongChain: 'Native USDC göndermek için Arc Testnet ağına geçin.',
    recipient: 'Alıcı', amount: 'USDC tutarı', add: 'Alıcı ekle', import: 'CSV içe aktar', paste: 'address,amount satırlarını yapıştırın',
    apply: 'Satırları uygula', total: 'Batch toplamı', balance: 'Cüzdan bakiyesi', recipients: 'Alıcılar', review: 'Batch’i incele',
    reviewTitle: 'Atomik batch’i onayla', atomic: 'Bir alıcı transferi reddederse işlemin tamamı geri alınır.',
    gas: 'Tahmini gas', confirm: 'Cüzdanda devam et', cancel: 'İptal', pending: 'İşlem bekliyor…', confirmed: 'Batch onaylandı.',
    failed: 'Batch başarısız', invalid: 'Devam etmeden önce geçersiz adres veya tutarları düzeltin.', insufficient: 'Cüzdan bakiyesi batch toplamı ve tahmini gas için yetersiz.',
    duplicate: 'Tekrarlanan adresler tek alıcı toplamında birleştirildi.', tooMany: 'Bir batch en fazla 100 alıcı satırı içerebilir.', explorer: 'Explorer', clear: 'Temizle', close: 'Kapat',
  },
} as const;

let rowSequence = 1;
function newRow(address = '', amount = ''): Row {
  return { id: rowSequence++, address, amount };
}

function parseRows(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [address = '', amount = ''] = line.split(/[,;\t ]+/);
    return newRow(address.trim(), amount.trim());
  });
}

function prepareRows(rows: Row[]) {
  const merged = new Map<string, PreparedRow>();
  let invalid = false;
  let duplicate = false;

  rows.filter((row) => row.address.trim() || row.amount.trim()).forEach((row) => {
    if (!isAddress(row.address.trim())) {
      invalid = true;
      return;
    }
    try {
      const amount = parseEther(row.amount.trim());
      if (amount <= 0n) throw new Error('AMOUNT_REQUIRED');
      const key = row.address.toLowerCase();
      const existing = merged.get(key);
      if (existing) {
        existing.amount += amount;
        duplicate = true;
      } else {
        merged.set(key, { address: row.address.trim() as `0x${string}`, amount });
      }
    } catch {
      invalid = true;
    }
  });

  const prepared = [...merged.values()];
  const total = prepared.reduce((sum, row) => sum + row.amount, 0n);
  return { prepared, total, invalid: invalid || prepared.length === 0 || prepared.length > 100, duplicate };
}

function usdc(value: bigint, digits = 6) {
  const formatted = Number(formatEther(value));
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(formatted);
}

export default function BulkSender({ language }: { language: Language }) {
  const copy = text[language];
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const isCorrectChain = chainId === arcNetworkTestnet.id;
  const balance = useBalance({ address, chainId: arcNetworkTestnet.id, query: { enabled: Boolean(address) } });
  const publicClient = usePublicClient({ chainId: arcNetworkTestnet.id });
  const { writeContractAsync, isPending: walletPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash, chainId: arcNetworkTestnet.id });
  const [rows, setRows] = useState<Row[]>([newRow(), newRow()]);
  const [paste, setPaste] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [estimate, setEstimate] = useState<bigint | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const prepared = useMemo(() => prepareRows(rows), [rows]);
  const hasInput = rows.some((row) => row.address.trim() || row.amount.trim());

  useEffect(() => {
    if (receipt.isSuccess) {
      setStatus(copy.confirmed);
      setReviewOpen(false);
      setRows([newRow(), newRow()]);
      setPaste('');
    }
  }, [copy.confirmed, receipt.isSuccess]);

  function updateRow(id: number, key: 'address' | 'amount', value: string) {
    setRows((current) => current.map((row) => row.id === id ? { ...row, [key]: value } : row));
  }

  function applyImported(value = paste) {
    const imported = parseRows(value);
    if (imported.length > 100) {
      setError(copy.tooMany);
      return;
    }
    if (imported.length) {
      setError('');
      setRows(imported);
    }
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const value = await file.text();
    setPaste(value);
    applyImported(value);
    event.target.value = '';
  }

  async function openReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setEstimate(null);
    if (prepared.invalid) {
      setError(copy.invalid);
      return;
    }
    if (!address || !publicClient) return;

    try {
      const gas = await publicClient.estimateContractGas({
        account: address,
        address: arcanumBulkSenderAddress,
        abi: arcanumBulkSenderAbi,
        functionName: 'batchSend',
        args: [prepared.prepared.map((row) => row.address), prepared.prepared.map((row) => row.amount)],
        value: prepared.total,
      });
      const gasPrice = await publicClient.getGasPrice();
      const gasCost = gas * gasPrice;
      setEstimate(gasCost);
      if ((balance.data?.value ?? 0n) < prepared.total + gasCost) {
        setError(copy.insufficient);
        return;
      }
      setReviewOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed);
    }
  }

  async function confirmBatch() {
    setError('');
    try {
      const nextHash = await writeContractAsync({
        address: arcanumBulkSenderAddress,
        abi: arcanumBulkSenderAbi,
        functionName: 'batchSend',
        args: [prepared.prepared.map((row) => row.address), prepared.prepared.map((row) => row.amount)],
        value: prepared.total,
        chainId: arcNetworkTestnet.id,
      });
      setHash(nextHash);
      setStatus(copy.pending);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : copy.failed);
    }
  }

  const unavailable = !isConnected ? copy.noWallet : !isCorrectChain ? copy.wrongChain : !isArcanumBulkSenderConfigured ? copy.notConfigured : '';

  return (
    <section className="panel min-h-[640px]">
      <div className="panel-header">
        <div><p className="eyebrow">{copy.eyebrow}</p><h2 className="panel-title">{copy.title}</h2><p className="mt-2 text-sm text-zinc-500">{copy.body}</p></div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-right"><p className="text-[11px] text-zinc-500">{copy.balance}</p><p className="mt-1 font-mono text-sm text-zinc-200">{usdc(balance.data?.value ?? 0n)} USDC</p></div>
      </div>

      {unavailable ? <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-500">{unavailable}</div> : null}
      {error ? <div className="helper-danger mt-4">{error}</div> : null}
      {status ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-sm text-sky-100">
          {receipt.isLoading || walletPending ? <Loader2 size={15} className="animate-spin" /> : receipt.isSuccess ? <CheckCircle2 size={15} /> : <WalletCards size={15} />}
          <span>{status}</span>
          {hash ? <a href={transactionUrl(hash)} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs underline">{copy.explorer}<ExternalLink size={12} /></a> : null}
        </div>
      ) : null}

      <form onSubmit={openReview} className="mt-5 grid gap-5">
        <div className="rounded-xl border border-zinc-800 bg-black/20 p-3 sm:p-4">
          <div className="grid gap-3">
            {rows.map((row, index) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[32px_minmax(0,1fr)_180px_40px] sm:items-center">
                <span className="hidden text-center font-mono text-xs text-zinc-600 sm:block">{index + 1}</span>
                <input value={row.address} onChange={(event) => updateRow(row.id, 'address', event.target.value)} placeholder={`${copy.recipient} 0x…`} className="input font-mono text-xs" />
                <input value={row.amount} onChange={(event) => updateRow(row.id, 'amount', event.target.value)} inputMode="decimal" placeholder={copy.amount} className="input" />
                <button type="button" onClick={() => setRows((current) => current.length === 1 ? current : current.filter((item) => item.id !== row.id))} className="btn-ghost h-10 w-10" aria-label="Remove recipient"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setRows((current) => current.length >= 100 ? current : [...current, newRow()])} disabled={rows.length >= 100} className="btn-ghost h-10 px-3"><Plus size={15} />{copy.add}</button>
            <label className="btn-ghost h-10 cursor-pointer px-3"><FileUp size={15} />{copy.import}<input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(event) => void importFile(event)} /></label>
            <button type="button" onClick={() => { setRows([newRow(), newRow()]); setPaste(''); setError(''); }} className="btn-subtle h-10 px-3">{copy.clear}</button>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-xl border border-zinc-800 bg-black/20 p-4">
            <label className="grid gap-2"><span className="text-xs font-medium text-zinc-400">{copy.paste}</span><textarea value={paste} onChange={(event) => setPaste(event.target.value)} className="input min-h-28 resize-y py-3 font-mono text-xs" placeholder="0x123…,1.5\n0x456…,2" /></label>
            <button type="button" onClick={() => applyImported()} disabled={!paste.trim()} className="btn-ghost mt-3 h-10 px-3">{copy.apply}</button>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
            <Metric label={copy.recipients} value={`${prepared.prepared.length}/100`} />
            <Metric label={copy.total} value={`${usdc(prepared.total)} USDC`} />
            {prepared.invalid && hasInput ? <p className="mt-3 text-xs leading-5 text-red-200">{copy.invalid}</p> : null}
            {prepared.duplicate ? <p className="mt-3 text-xs leading-5 text-amber-200">{copy.duplicate}</p> : null}
            <button type="submit" disabled={Boolean(unavailable) || prepared.invalid || walletPending || receipt.isLoading} className="btn-primary mt-4 h-11 w-full px-4"><Send size={16} />{copy.review}</button>
          </div>
        </div>
      </form>

      {reviewOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={copy.reviewTitle}>
          <div className="modal-panel">
            <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">{copy.eyebrow}</p><h3 className="mt-2 text-xl font-semibold text-white">{copy.reviewTitle}</h3></div><button type="button" onClick={() => setReviewOpen(false)} className="btn-ghost h-9 w-9" aria-label={copy.close}><X size={16} /></button></div>
            <div className="mt-5 grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
              <Metric label={copy.recipients} value={String(prepared.prepared.length)} />
              <Metric label={copy.total} value={`${usdc(prepared.total)} USDC`} />
              <Metric label={copy.gas} value={estimate === null ? '—' : `≈ ${usdc(estimate, 8)} USDC`} />
            </div>
            <p className="mt-4 helper-warning">{copy.atomic}</p>
            {error ? <div className="helper-danger mt-3">{error}</div> : null}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setReviewOpen(false)} disabled={walletPending || receipt.isLoading} className="btn-ghost h-10 px-4">{copy.cancel}</button><button type="button" onClick={() => void confirmBatch()} disabled={walletPending || receipt.isLoading} className="btn-primary h-10 px-4">{walletPending || receipt.isLoading ? <Loader2 size={15} className="animate-spin" /> : <WalletCards size={15} />}{copy.confirm}</button></div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-zinc-800 py-2 last:border-0"><span className="text-xs text-zinc-500">{label}</span><span className="font-mono text-sm text-zinc-200">{value}</span></div>;
}
