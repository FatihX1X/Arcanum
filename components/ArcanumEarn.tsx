'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useGasPrice, useReadContract } from 'wagmi';
import { AppKit } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { Blockchain, getChainByEnum } from '@circle-fin/swap-kit';
import { createPublicClient, formatUnits, http, parseAbi, type EIP1193Provider } from 'viem';
import { arcNetwork, transactionUrl } from '../lib/chain';
import { rpcProxyPath } from '../lib/rpcProxy';
import { arcSwapTokens, estimateGasReserveUsdc, type SwapEip1193Provider } from '../lib/circleSwap';
import { assertEarnQuote, createEarnScopedProvider, earnChain, earnError, earnGasReserve, earnMaximum, earnQuoteMatches, earnUnits, formatEarnAmount, parseEarnAmount, type EarnAction } from '../lib/circleEarn';
import { readLocalEarnHistory, reconcileLocalEarnHistory, saveLocalEarnHistory, type EarnHistoryItem } from '../lib/history';
import type { Language } from './arcanumCopy';
import { Badge, Button, Field, IconButton, cx } from './ui';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, RefreshCw, Wallet } from './PixelIcons';

const kit = new AppKit({ disableErrorReporting: true, disableAnalytics: true });
type Vault = Awaited<ReturnType<typeof kit.earn.exploreVaults>>['vaults'][number];
type Position = Awaited<ReturnType<typeof kit.earn.getPosition>>;
type Preview = Awaited<ReturnType<typeof kit.earn.getDepositQuote>> | Awaited<ReturnType<typeof kit.earn.getWithdrawalQuote>> | Awaited<ReturnType<typeof kit.earn.getClaimRewardsQuote>>;
type Quote = { key: string; at: number; data: Preview };
const balanceAbi = parseAbi(['function balanceOf(address) view returns (uint256)']);
const vaultAssetAbi = parseAbi(['function asset() view returns (address)']);
const publicClient = createPublicClient({ chain: arcNetwork, transport: http(rpcProxyPath(5042)) });

const copy = {
  en: {
    vaults: 'Vaults', positions: 'My positions', all: 'All assets', apy: 'APY', tvl: 'Total deposits', liquidity: 'Liquidity', name: 'Name',
    loading: 'Loading vaults…', empty: 'No vaults found.', noPositions: 'No positions found.', choose: 'Select a vault to view details.',
    manager: 'Curator', fees: 'Vault fees', collateral: 'Collateral', unavailable: 'Unavailable', active: 'Active', low: 'Low liquidity',
    deposit: 'Deposit', withdraw: 'Withdraw', claim: 'Claim rewards', amount: 'Amount', max: 'Max', balance: 'Available', preview: 'Preview', confirm: 'Confirm in wallet',
    shares: 'Vault shares', position: 'Position value', yield: 'Yield earned', pendingPnl: 'Reconciling', unavailablePnl: 'Yield data unavailable', rewards: 'Rewards',
    risk: 'Returns vary and are not guaranteed. Vaults carry contract, collateral, curator and liquidity risk; withdrawals depend on available liquidity.',
    guarded: 'Circle monitored', guardedNote: 'Monitoring does not guarantee returns or protect against loss.',
    connect: 'Connect your wallet to deposit or view your positions.', network: 'Switch to Arc mainnet to continue.',
    select: 'Select', wallet: 'Waiting for wallet approval', pending: 'Transaction submitted. Waiting for confirmation.', success: 'Transaction confirmed.',
    failed: 'Transaction reverted.', expired: 'Preview expired. Request a new preview.', insufficient: 'Amount exceeds the available balance or liquidity.',
    gas: 'Estimated gas (USDC)', afterApproval: 'Available after approval', noRewards: 'No claimable rewards.', partial: 'Some positions could not be loaded. Refresh to retry.',
    noCollateral: 'No collateral data available.', feePerformance: 'Performance', feeManagement: 'Management', timestamp: 'Updated',
  },
  tr: {
    vaults: 'Vaultlar', positions: 'Pozisyonlarım', all: 'Tüm varlıklar', apy: 'APY', tvl: 'Toplam yatırılan', liquidity: 'Likidite', name: 'İsim',
    loading: 'Vaultlar yükleniyor…', empty: 'Vault bulunamadı.', noPositions: 'Pozisyon bulunamadı.', choose: 'Detayları görmek için bir vault seçin.',
    manager: 'Yönetici', fees: 'Vault ücretleri', collateral: 'Teminatlar', unavailable: 'Kullanılamıyor', active: 'Aktif', low: 'Düşük likidite',
    deposit: 'Yatır', withdraw: 'Çek', claim: 'Ödülleri al', amount: 'Tutar', max: 'Maks.', balance: 'Kullanılabilir', preview: 'Önizle', confirm: 'Cüzdanda onayla',
    shares: 'Vault payları', position: 'Pozisyon değeri', yield: 'Kazanılan getiri', pendingPnl: 'Hesaplanıyor', unavailablePnl: 'Getiri verisi mevcut değil', rewards: 'Ödüller',
    risk: 'Getiri değişkendir ve garanti edilmez. Vaultlar kontrat, teminat, yönetici ve likidite riski taşır; çekimler mevcut likiditeye bağlıdır.',
    guarded: 'Circle izlemeli', guardedNote: 'İzleme, getiri garantisi veya kayıplara karşı koruma sağlamaz.',
    connect: 'Yatırmak veya pozisyonlarınızı görmek için cüzdanınızı bağlayın.', network: 'Devam etmek için Arc mainnet ağına geçin.',
    select: 'Seç', wallet: 'Cüzdan onayı bekleniyor', pending: 'İşlem gönderildi. Zincir onayı bekleniyor.', success: 'İşlem onaylandı.',
    failed: 'İşlem zincirde başarısız oldu.', expired: 'Önizleme süresi doldu. Yeni önizleme isteyin.', insufficient: 'Tutar kullanılabilir bakiye veya likiditeyi aşıyor.',
    gas: 'Tahmini gas (USDC)', afterApproval: 'Token onayından sonra hesaplanabilir', noRewards: 'Alınabilir ödül yok.', partial: 'Bazı pozisyonlar yüklenemedi. Yenileyerek tekrar deneyin.',
    noCollateral: 'Teminat verisi mevcut değil.', feePerformance: 'Performans', feeManagement: 'Yönetim', timestamp: 'Güncellendi',
  },
};

function percent(n: number) { return `${(n * 100).toFixed(2)}%`; }
function displayAmount(n: string, language: Language) { return Number(n).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 2 }); }
function warningLabel(type: string, language: Language) {
  const labels: Record<string, [string, string]> = {
    low_liquidity: ['Low withdrawal liquidity', 'Düşük çekim likiditesi'],
    not_whitelisted: ['Not on the protocol listing allowlist', 'Protokol listeleme izin listesinde değil'],
    timelock: ['Timelock configuration warning', 'Zaman kilidi yapılandırma uyarısı'],
  };
  return labels[type]?.[language === 'tr' ? 1 : 0] ?? type.replaceAll('_', ' ');
}
function config() { return { baseUrl: window.location.origin, batchTransactions: false }; }
function supportedVault(vault: Vault) {
  const token = arcSwapTokens[vault.asset as keyof typeof arcSwapTokens];
  return vault.productType === 'vault' && vault.protocol === 'MORPHO' && vault.chain === earnChain && !!token && token.address.toLowerCase() === vault.assetAddress.toLowerCase();
}
function vaultWarnings(vault: Vault) {
  const warnings = [...(vault.warnings ?? []), ...(vault.riskSignals?.warnings ?? []), ...(vault.riskSignals?.earnKitWarnings ?? []).map(type => ({ type, level: 'YELLOW' as const }))];
  return [...new Map(warnings.map(w => [`${w.type}:${w.level}`, w])).values()];
}

export default function ArcanumEarn({ language }: { language: Language }) {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  // Remount account-scoped reads and previews on wallet/network changes.
  return <EarnPanel key={`${address ?? 'guest'}:${chainId}`} language={language} account={address} connector={connector} connected={isConnected} chainId={chainId} />;
}

function EarnPanel({ language, account, connector, connected, chainId }: {
  language: Language; account?: `0x${string}`; connector: ReturnType<typeof useAccount>['connector']; connected: boolean; chainId: number;
}) {
  const t = copy[language];
  const ready = connected && !!account && chainId === 5042;
  const [tab, setTab] = useState<'vaults' | 'positions'>('vaults');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'apy' | 'tvl' | 'name'>('tvl');
  const [vaults, setVaults] = useState<readonly Vault[]>([]);
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<EarnAction>('deposit');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [phase, setPhase] = useState<'idle' | 'preview' | 'wallet' | 'pending'>('idle');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [txHash, setTxHash] = useState<`0x${string}`>();
  const [tick, setTick] = useState(Date.now());
  const mounted = useRef(true);
  const generation = useRef(0);
  const busy = useRef(false);
  const key = `${account}:${chainId}:${selected}:${action}:${amount}`;
  const currentKey = useRef(key);
  currentKey.current = key;
  const vault = vaults.find(v => v.vaultAddress === selected);
  const position = selected ? positions[selected] : undefined;
  const { data: gasPrice } = useGasPrice({ chainId: 5042 });
  const { data: tokenBalance, refetch: refetchBalance } = useReadContract({
    address: vault?.assetAddress as `0x${string}` | undefined, abi: balanceAbi, functionName: 'balanceOf', args: account ? [account] : undefined,
    chainId: 5042, query: { enabled: ready && !!vault, refetchInterval: 30_000 },
  });
  const reserve = earnGasReserve(quote?.data.gasFees, estimateGasReserveUsdc(gasPrice, 1_000_000n));
  const maximum = earnMaximum(action, action === 'withdraw' ? earnUnits(position?.currentBalance) : tokenBalance ?? 0n, earnUnits(vault?.liquidity), reserve, vault?.asset ?? 'USDC');
  const amountUnits = parseEarnAmount(amount);
  const canPreview = ready && !!vault && (action === 'claim' || (!!amountUnits && amountUnits <= maximum)) && (action !== 'deposit' || vault.status === 'active');
  const fresh = earnQuoteMatches(quote, key, tick);
  const locked = phase !== 'idle';

  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => { mounted.current = false; clearInterval(timer); };
  }, []);

  const adapter = useCallback(async (intentKey?: string, onSubmitted?: (hash: `0x${string}`) => void) => {
    if (!account || !connector || !ready) throw new Error('Wrong network or wallet unavailable');
    const provider = await connector.getProvider() as SwapEip1193Provider;
    const scoped = await createEarnScopedProvider(provider, account, () => mounted.current && (!intentKey || currentKey.current === intentKey), onSubmitted);
    return createViemAdapterFromProvider({ provider: scoped as EIP1193Provider, getPublicClient: ({ chain }) => createPublicClient({ chain, transport: http(rpcProxyPath(chain.id)) }), capabilities: { addressContext: 'user-controlled', supportedChains: [getChainByEnum(Blockchain.Arc)] } });
  }, [account, connector, ready]);

  const refresh = useCallback(async () => {
    const version = ++generation.current;
    setLoading(true); setError('');
    try {
      const found: Vault[] = [];
      for await (const v of kit.earn.exploreVaultsIterator({ chain: earnChain, protocol: 'MORPHO', pageSize: 100, config: config() })) {
        if (supportedVault(v)) found.push(v);
      }
      // Preserve exits from previously used vaults even if discovery stops listing them.
      const missing = account ? [...new Set(readLocalEarnHistory(account).map(r => r.vaultAddress))].filter(a => !found.some(v => v.vaultAddress.toLowerCase() === a.toLowerCase())) : [];
      for (let i = 0; i < missing.length; i += 20) {
        const extra = await kit.earn.getVaults({ vaults: missing.slice(i, i + 20).map(vaultAddress => ({ chain: earnChain, vaultAddress })), config: config() });
        found.push(...extra.vaults.filter(supportedVault));
      }
      if (!mounted.current || version !== generation.current) return;
      setVaults(found);
      if (ready) {
        const walletAdapter = await adapter();
        const next: Record<string, Position> = {};
        let failures = 0;
        for (let i = 0; i < found.length; i += 4) {
          const results = await Promise.allSettled(found.slice(i, i + 4).map(v => kit.earn.getPosition({ from: { adapter: walletAdapter, chain: earnChain }, vaultAddress: v.vaultAddress, config: config() })));
          results.forEach((r, j) => { if (r.status === 'fulfilled') next[found[i + j].vaultAddress] = r.value; else failures++; });
          if (!mounted.current || version !== generation.current) return;
        }
        setPositions(next);
        if (failures) setNotice(t.partial);
      }
    } catch (e) { if (mounted.current && version === generation.current) setError(earnError(e, language === 'tr')); }
    finally { if (mounted.current && version === generation.current) setLoading(false); }
  }, [account, adapter, ready, language, t.partial]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    async function reconcile() {
      const records = await reconcileLocalEarnHistory(account!, hash => publicClient.getTransactionReceipt({ hash }));
      const submitted = records.find(r => r.txHash === txHash);
      if (!cancelled && submitted && submitted.status !== 'pending' && !busy.current) {
        setPhase('idle'); setNotice(submitted.status === 'confirmed' ? t.success : t.failed);
        void refetchBalance();
      }
    }
    void reconcile();
    const timer = setInterval(() => void reconcile(), 15_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [account, txHash, refetchBalance, t.success, t.failed]);

  async function preview() {
    if (!canPreview || busy.current || !vault) return;
    busy.current = true; setPhase('preview'); setError(''); setNotice(''); setQuote(null);
    const requestKey = key;
    try {
      const walletAdapter = await adapter(requestKey);
      const params = { from: { adapter: walletAdapter, chain: earnChain }, vaultAddress: vault.vaultAddress, amount, config: config() };
      const data = action === 'deposit' ? await kit.earn.getDepositQuote(params) : action === 'withdraw' ? await kit.earn.getWithdrawalQuote(params) : await kit.earn.getClaimRewardsQuote(params);
      if (mounted.current && currentKey.current === requestKey) {
        if ('deposit' in data || 'withdrawal' in data) assertEarnQuote(data, vault, amount);
        if ('maxWithdrawable' in data && amountUnits && amountUnits > earnUnits(data.maxWithdrawable.amount)) throw new Error('Insufficient liquidity');
        if ('rewards' in data && !data.rewards.length) { setNotice(t.noRewards); return; }
        setQuote({ key: requestKey, at: Date.now(), data });
      }
    } catch (e) { if (mounted.current) setError(earnError(e, language === 'tr')); }
    finally { busy.current = false; if (mounted.current) setPhase('idle'); }
  }

  async function submit() {
    if (busy.current || !canPreview || !vault || !account || !earnQuoteMatches(quote, key)) return;
    busy.current = true; setPhase('wallet'); setError(''); setNotice('');
    const requestKey = key;
    let record: EarnHistoryItem | undefined;
    try {
      const walletAdapter = await adapter(requestKey, hash => {
        record = { id: `earn:${hash}`, kind: 'earn', action, account, chainId: 5042, vaultAddress: vault.vaultAddress, vaultName: vault.name, amount: action === 'claim' ? '' : amount, asset: action === 'claim' ? '' : vault.asset, timestamp: Date.now(), status: 'pending', txHash: hash };
        saveLocalEarnHistory(record);
        if (mounted.current) { setTxHash(hash); setPhase('pending'); setQuote(null); }
      });
      const from = { adapter: walletAdapter, chain: earnChain };
      const latest = await kit.earn.getVaults({ vaults: [{ chain: earnChain, vaultAddress: vault.vaultAddress }], config: config() });
      const latestVault = latest.vaults[0];
      if (!latestVault || !supportedVault(latestVault) || latestVault.vaultAddress.toLowerCase() !== vault.vaultAddress.toLowerCase() || latestVault.assetAddress.toLowerCase() !== vault.assetAddress.toLowerCase() || (action === 'deposit' && latestVault.status !== 'active')) throw new Error('Vault unavailable');
      const onchainAsset = await publicClient.readContract({ address: vault.vaultAddress as `0x${string}`, abi: vaultAssetAbi, functionName: 'asset' });
      if (onchainAsset.toLowerCase() !== vault.assetAddress.toLowerCase()) throw new Error('Vault asset mismatch');
      const newBalance = await refetchBalance();
      const nativeBalance = await publicClient.getBalance({ address: account });
      if (nativeBalance / 1_000_000_000_000n < reserve) throw new Error('Insufficient gas balance');
      if (action !== 'claim') {
        const latestPosition = action === 'withdraw' ? await kit.earn.getPosition({ from, vaultAddress: vault.vaultAddress, config: config() }) : undefined;
        const max = earnMaximum(action, action === 'withdraw' ? earnUnits(latestPosition?.currentBalance) : newBalance.data ?? 0n, earnUnits(latestVault.liquidity), reserve, vault.asset);
        if (!amountUnits || amountUnits > max) throw new Error('Insufficient balance or liquidity');
      }
      if (!earnQuoteMatches(quote, requestKey)) throw new Error('Quote expired');
      const params = { from, vaultAddress: vault.vaultAddress, amount, config: config() };
      const result = action === 'deposit' ? await kit.earn.deposit(params) : action === 'withdraw' ? await kit.earn.withdraw(params) : await kit.earn.claimRewards(params);
      if ('status' in result && result.status === 'no_rewards') { if (mounted.current) setNotice(t.noRewards); return; }
      if (!('txHash' in result) || !/^0x[a-fA-F0-9]{64}$/.test(result.txHash)) throw new Error('Missing transaction receipt');
      const hash = result.txHash as `0x${string}`;
      record = { id: `earn:${hash}`, kind: 'earn', action, account, chainId: 5042, vaultAddress: vault.vaultAddress, vaultName: vault.name, amount: 'amount' in result ? result.amount : 'rewards' in result ? result.rewards.map(r => `${r.amount} ${r.symbol}`).join(', ') : amount, asset: action === 'claim' ? '' : vault.asset, timestamp: Date.now(), status: 'pending', txHash: hash };
      saveLocalEarnHistory(record);
      if (mounted.current) { setTxHash(hash); setPhase('pending'); setQuote(null); }
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
      record.status = receipt.status === 'success' ? 'confirmed' : 'failed'; saveLocalEarnHistory(record);
      if (mounted.current) {
        setNotice(receipt.status === 'success' ? t.success : t.failed);
        setAmount(''); await refetchBalance(); await refresh();
      }
    } catch (e) {
      if (mounted.current) { setQuote(null); setError(record ? t.pending : earnError(e, language === 'tr')); }
    } finally { busy.current = false; if (mounted.current) setPhase(record?.status === 'pending' ? 'pending' : 'idle'); }
  }

  const list = vaults.filter(v => (filter === 'all' || v.asset === filter) && (tab === 'vaults' || Number(positions[v.vaultAddress]?.shares ?? '0') > 0)).slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'apy' ? b.currentApy - a.currentApy : earnUnits(a.totalDeposits) < earnUnits(b.totalDeposits) ? 1 : -1);

  function select(v: Vault) { setSelected(v.vaultAddress); setAmount(''); setQuote(null); setError(''); setNotice(''); setTxHash(undefined); setAction(v.status === 'active' ? 'deposit' : 'withdraw'); }
  function labelStatus(v: Vault) { return v.status === 'active' ? t.active : v.status === 'low_liquidity' ? t.low : t.unavailable; }

  return (
    <section className="panel min-h-[680px] overflow-hidden">
      <div className="panel-header gap-3"><div><p className="eyebrow">Circle · Morpho · Arc Mainnet</p><h2 className="panel-title">Arcanum Earn</h2></div><IconButton label={language === 'tr' ? 'Yenile' : 'Refresh'} onClick={() => { setQuote(null); void refresh(); }} disabled={locked || loading}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></IconButton></div>
      <div className="border-b border-zinc-800 px-5 py-3 flex flex-wrap items-center gap-3">
        <div className="flex gap-1" role="tablist" aria-label="Earn"><Button role="tab" aria-selected={tab === 'vaults'} variant={tab === 'vaults' ? 'primary' : 'subtle'} size="sm" onClick={() => setTab('vaults')}>{t.vaults}</Button><Button role="tab" aria-selected={tab === 'positions'} variant={tab === 'positions' ? 'primary' : 'subtle'} size="sm" onClick={() => setTab('positions')}>{t.positions}</Button></div>
        <select className="input w-auto min-w-0 text-xs" aria-label={t.all} value={filter} onChange={e => setFilter(e.target.value)}><option value="all">{t.all}</option><option>USDC</option><option>EURC</option></select>
        <select className="input w-auto min-w-0 text-xs" aria-label={language === 'tr' ? 'Sıralama' : 'Sort'} value={sort} onChange={e => setSort(e.target.value as typeof sort)}><option value="tvl">{t.tvl}</option><option value="apy">{t.apy}</option><option value="name">{t.name}</option></select>
      </div>
      <div className="p-5 space-y-4">
        {!ready ? <p className="text-sm text-zinc-400">{connected ? t.network : t.connect}</p> : null}
        {error ? <p role="alert" className="text-sm text-red-300">{error}</p> : null}
        {notice ? <p role="status" className="text-sm text-zinc-300">{notice}</p> : null}
        {phase === 'wallet' || phase === 'pending' ? <p role="status" className="text-sm text-emerald-300">{phase === 'wallet' ? t.wallet : t.pending}</p> : null}
        {txHash ? <a className="text-accent inline-flex items-center gap-2 text-xs" href={transactionUrl(txHash)} target="_blank" rel="noreferrer">{txHash.slice(0, 12)}…<ExternalLink size={13} /></a> : null}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            {loading && (!vaults.length || tab === 'positions') ? <p className="py-8 text-sm text-zinc-500">{t.loading}</p> : !list.length ? <p className="py-8 text-sm text-zinc-500">{tab === 'positions' ? ready ? t.noPositions : t.connect : t.empty}</p> : (
              <div className="max-h-[620px] overflow-y-auto divide-y divide-zinc-800">
                {list.map(v => <button key={v.vaultAddress} onClick={() => select(v)} disabled={locked} aria-pressed={selected === v.vaultAddress} className={cx('w-full text-left px-3 py-4 transition-colors hover:bg-zinc-900', selected === v.vaultAddress && 'bg-emerald-400/5 border-l-2 border-emerald-400')}>
                  <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold text-zinc-100">{v.name || `${v.asset} · ${v.vaultAddress.slice(0, 10)}…`}</p><p className="mt-1 text-xs text-zinc-500">{v.asset} · Morpho</p></div><Badge tone={v.status === 'active' ? 'success' : 'warning'}>{labelStatus(v)}</Badge></div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><Metric label={t.apy} value={percent(v.currentApy)} /><Metric label={t.tvl} value={displayAmount(v.totalDeposits, language)} /><Metric label={t.liquidity} value={displayAmount(v.liquidity, language)} /></div>
                  {tab === 'positions' ? <p className="mt-2 text-xs text-emerald-300">{t.position}: {positions[v.vaultAddress]?.currentBalance} {v.asset}</p> : null}
                  {vaultWarnings(v).length ? <p className={cx('mt-2 text-xs', vaultWarnings(v).some(w => w.level === 'RED') ? 'text-red-300' : 'text-amber-200')}>{vaultWarnings(v).map(w => warningLabel(w.type, language)).join(' · ')}</p> : null}
                </button>)}
              </div>
            )}
          </div>
          <div className="order-first min-w-0 xl:order-last xl:border-l xl:border-zinc-800 xl:pl-6">
            {!vault ? <div className="py-12 text-sm text-zinc-500 flex items-center gap-3"><Wallet size={18} />{t.choose}</div> : (
              <div className="space-y-5">
                <div><h3 className="text-base font-semibold break-words">{vault.name || vault.asset}</h3><a className="mt-2 text-xs text-zinc-500 break-all inline-flex items-center gap-2" href={`https://explorer.arc.io/address/${vault.vaultAddress}`} target="_blank" rel="noreferrer">{vault.vaultAddress}<ExternalLink size={12} className="shrink-0" /></a></div>
                <div className="grid grid-cols-2 gap-3"><Metric label={t.manager} value={vault.manager?.name || t.unavailable} /><Metric label={t.apy} value={percent(vault.currentApy)} /><Metric label={t.feePerformance} value={percent(vault.fee?.performance ?? vault.vaultFee)} /><Metric label={t.feeManagement} value={percent(vault.fee?.management ?? 0)} /></div>
                {vault.circleGuarded ? <div><Badge tone="info">{t.guarded}</Badge><p className="mt-2 text-xs text-zinc-500">{t.guardedNote}</p></div> : null}
                {vaultWarnings(vault).map((w, i) => <p key={i} className={cx('text-xs border-l-2 pl-3', w.level === 'RED' ? 'text-red-300 border-red-400' : 'text-amber-200 border-amber-300')}>{warningLabel(w.type, language)}</p>)}
                {vault.asOf ? <p className="text-xs text-zinc-500">{t.timestamp}: {new Date(vault.asOf).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}</p> : null}
                <div><p className="field-label">{t.collateral}</p>{vault.collateral.length ? vault.collateral.map((c, i) => <p key={i} className="mt-2 text-xs text-zinc-400">{c.asset} · LLTV {percent(c.lltv)}{c.allocationPct != null ? ` · ${percent(c.allocationPct)}` : ''}</p>) : <p className="mt-2 text-xs text-zinc-500">{t.noCollateral}</p>}</div>
                {position ? <div className="grid grid-cols-2 gap-3 border-y border-zinc-800 py-4"><Metric label={t.position} value={`${position.currentBalance} ${vault.asset}`} /><Metric label={t.shares} value={position.shares} /><Metric label={t.yield} value={position.pnl.status === 'available' ? `${position.pnl.totalYieldEarned} ${vault.asset}` : position.pnl.status === 'pending' ? t.pendingPnl : t.unavailablePnl} /><Metric label={t.rewards} value={position.rewardsUnavailableReason ? t.unavailable : position.accruedRewards.map(r => `${r.amount} ${r.symbol}`).join(', ') || '—'} /></div> : null}
                <div className="flex flex-wrap gap-1">{(['deposit', 'withdraw', 'claim'] as const).map(a => <Button key={a} size="sm" variant={action === a ? 'primary' : 'subtle'} disabled={locked} onClick={() => { setAction(a); setQuote(null); setAmount(''); setError(''); }}>{a === 'deposit' ? <ArrowDownLeft size={14} /> : a === 'withdraw' ? <ArrowUpRight size={14} /> : <Wallet size={14} />}{t[a]}</Button>)}</div>
                {action !== 'claim' ? <><div className="flex justify-between gap-2 text-xs text-zinc-500"><span>{t.balance}: {formatEarnAmount(maximum)} {vault.asset}</span><button type="button" className="text-accent" disabled={locked || !ready} onClick={() => { setAmount(formatEarnAmount(maximum)); setQuote(null); }}>{t.max}</button></div><Field label={`${t.amount} (${vault.asset})`} inputMode="decimal" value={amount} disabled={locked} onChange={e => { if (/^\d*(\.\d{0,6})?$/.test(e.target.value)) { setAmount(e.target.value); setQuote(null); } }} error={amountUnits && amountUnits > maximum ? t.insufficient : undefined} /></> : null}
                {quote && quote.key === key ? <div className="border-y border-zinc-800 py-4 space-y-2 text-xs text-zinc-400">
                  {'expectedShares' in quote.data ? <Metric label={t.shares} value={quote.data.expectedShares.amount} /> : null}
                  {'withdrawal' in quote.data ? <Metric label={t.withdraw} value={`${quote.data.withdrawal.amount} ${quote.data.withdrawal.symbol}`} /> : null}
                  {'fees' in quote.data ? <Metric label={t.fees} value={quote.data.fees.map(f => `${f.amount} ${f.symbol}`).join(', ') || '0'} /> : null}
                  {'rewards' in quote.data ? <Metric label={t.rewards} value={quote.data.rewards.map(r => `${r.amount} ${r.symbol}`).join(', ')} /> : null}
                  {quote.data.gasFees?.map((g, i) => <Metric key={i} label={`${t.gas} · ${g.name}`} value={g.fees ? formatUnits(BigInt(g.fees.fee), 18) : t.afterApproval} />)}
                  {!fresh ? <p className="text-amber-200">{t.expired}</p> : null}
                </div> : null}
                <div className="flex flex-wrap gap-2"><Button disabled={!canPreview || locked} loading={phase === 'preview'} onClick={() => void preview()}><RefreshCw size={14} />{t.preview}</Button><Button variant="primary" disabled={!canPreview || !fresh || locked} loading={phase === 'wallet' || phase === 'pending'} onClick={() => void submit()}><Wallet size={14} />{t.confirm}</Button></div>
              </div>
            )}
          </div>
        </div>
        <p className="border-t border-zinc-800 pt-4 text-xs leading-5 text-zinc-500">{t.risk}</p>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[11px] text-zinc-500">{label}</p><p className="mt-1 break-words text-xs text-zinc-200">{value}</p></div>;
}
