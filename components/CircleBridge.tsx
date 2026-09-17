'use client';

import {
  ArrowDownUp,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Route,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import {
  BridgeKit,
  TransferSpeed,
  type BridgeResult,
  type EstimateResult,
} from '@circle-fin/bridge-kit';
import {
  createPublicClient,
  formatUnits,
  http,
  parseAbi,
  zeroAddress,
  type EIP1193Provider,
} from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  useReadContract,
  useSwitchChain,
} from 'wagmi';

import {
  arcBridgeChain,
  bridgeChainById,
  bridgeChainByKey,
  bridgeDestinationsFor,
  bridgeEvmChains,
  defaultBridgeCounterpart,
  isSupportedArcBridgeRoute,
  type BridgeChainKey,
} from '@/lib/bridgeChains';
import {
  arcBridgeMaxBalance,
  arcNativeGasWeiToTokenUnits,
  assertBridgeEstimateIntegrity,
  bridgeGasFeeToNativeUnits,
  bridgeErrorKind,
  bridgeEstimateDebounceMs,
  bridgeEstimateTtlMs,
  bridgeFeeTotal,
  isArcBridgeSource,
  isFreshBridgeEstimate,
  type BridgeErrorKind,
} from '@/lib/circleBridge';
import {
  createAccountScopedSwapProvider,
  formatSwapUnits,
  isSwapAmountInput,
  normalizeSwapAmount,
  parseSwapAmount,
} from '@/lib/circleSwap';
import {
  saveLocalBridgeHistory,
  type BridgeHistoryStep,
  type LocalBridgeHistoryRecord,
} from '@/lib/history';
import { rpcProxyPath } from '@/lib/rpcProxy';
import type { Language } from './arcanumCopy';

type BridgePhase =
  | 'idle'
  | 'switching'
  | 'estimating'
  | 'ready'
  | 'approval'
  | 'burn'
  | 'attestation'
  | 'mint'
  | 'success'
  | 'error';

type QuoteState = { estimate: EstimateResult; estimatedAt: number };
type BrowserAdapter = Awaited<ReturnType<typeof createBridgeBrowserAdapter>>;

const erc20BalanceAbi = parseAbi(['function balanceOf(address account) view returns (uint256)']);
const bridgeKit = new BridgeKit({ disableErrorReporting: true });

function createBridgeBrowserAdapter(provider: EIP1193Provider) {
  return createViemAdapterFromProvider({
    provider,
    getPublicClient: ({ chain }) => createPublicClient({
      chain,
      transport: http(rpcProxyPath(chain.id)),
    }),
    capabilities: {
      addressContext: 'user-controlled',
      supportedChains: [...bridgeEvmChains],
    },
  });
}

const bridgeCopy = {
  en: {
    title: 'Bridge',
    eyebrow: 'Circle CCTP V2',
    description: 'Move USDC between Arc mainnet and supported EVM chains using Circle CCTP V2 and Forwarding Service.',
    source: 'Source network',
    destination: 'Destination network',
    amount: 'Amount',
    balance: 'USDC balance',
    nativeBalance: 'Native gas balance',
    recipient: 'Destination recipient',
    connectedRecipient: 'The connected wallet address is used on the destination network.',
    max: 'Max',
    token: 'Asset',
    standard: 'Standard CCTP',
    standardHelp: 'Circle attestation and forwarded mint are included. Fast Transfer is disabled.',
    estimate: 'Estimate',
    provider: 'Provider',
    fees: 'Provider and Forwarder fees',
    gas: 'Estimated gas',
    total: 'Transfer + USDC fees',
    noFees: 'No fee reported',
    noEstimate: 'Enter an amount to request a live estimate.',
    expired: 'This estimate expired. It will be refreshed before submission.',
    disconnected: 'Connect an EVM wallet to use Bridge.',
    wrongSource: 'Switch the wallet to the selected source network.',
    switchNetwork: 'Switch network',
    submit: 'Bridge USDC',
    pending: 'The transfer can take several minutes while Circle waits for attestation and forwards the mint.',
    batch: 'The SDK uses wallet batching when supported and automatically falls back to sequential approval and burn.',
    steps: {
      idle: 'Waiting for amount',
      switching: 'Switching source network',
      estimating: 'Estimating route',
      ready: 'Estimate ready',
      approval: 'Approval',
      burn: 'Burn',
      attestation: 'Attestation',
      mint: 'Forwarded mint',
      success: 'Completed',
      error: 'Action needed',
    },
    errors: {
      rejected: 'The wallet request was rejected.',
      'wrong-source-chain': 'The wallet is not connected to the selected source network.',
      'wallet-provider': 'The connected wallet account could not be accessed.',
      'unsupported-route': 'This Arc mainnet bridge route is not supported by Circle.',
      'insufficient-usdc': 'The wallet does not have enough USDC.',
      'insufficient-gas': 'The source network native gas balance is insufficient.',
      'quote-expired': 'The estimate expired. Request a new estimate.',
      'rate-limited': 'Circle or the source RPC is busy. Try again shortly.',
      forwarder: 'Circle attestation or Forwarding Service could not complete the destination mint.',
      partial: 'The source transaction succeeded, but the transfer is not fully completed yet. Check the recorded steps in History.',
      'service-unavailable': 'The Circle bridge service could not be reached.',
      unknown: 'The bridge transfer could not be completed.',
    } satisfies Record<BridgeErrorKind, string>,
  },
  tr: {
    title: 'Bridge',
    eyebrow: 'Circle CCTP V2',
    description: 'USDC’yi Circle kontratları ve Forwarding Service ile Arc mainnet ve desteklenen EVM ağları arasında taşıyın.',
    source: 'Kaynak ağ',
    destination: 'Hedef ağ',
    amount: 'Miktar',
    balance: 'USDC bakiyesi',
    nativeBalance: 'Native gas bakiyesi',
    recipient: 'Hedef alıcı',
    connectedRecipient: 'Hedef ağda bağlı cüzdan adresi kullanılır.',
    max: 'Maks.',
    token: 'Varlık',
    standard: 'Standart CCTP',
    standardHelp: 'Circle attestation ve forwarded mint dahildir. Fast Transfer kapalıdır.',
    estimate: 'Tahmin',
    provider: 'Sağlayıcı',
    fees: 'Provider ve Forwarder ücretleri',
    gas: 'Tahmini gas',
    total: 'Transfer + USDC ücretleri',
    noFees: 'Ücret bildirilmedi',
    noEstimate: 'Canlı tahmin almak için miktar girin.',
    expired: 'Bu tahminin süresi doldu. Gönderimden önce yenilenecek.',
    disconnected: 'Bridge kullanmak için EVM cüzdanınızı bağlayın.',
    wrongSource: 'Cüzdanı seçili kaynak ağa geçirin.',
    switchNetwork: 'Ağı değiştir',
    submit: 'USDC Bridge',
    pending: 'Circle attestation beklerken ve mint işlemini iletirken transfer birkaç dakika sürebilir.',
    batch: 'SDK destekleyen cüzdanlarda batching kullanır; desteklenmiyorsa approval ve burn adımlarını sıralı yürütür.',
    steps: {
      idle: 'Miktar bekleniyor',
      switching: 'Kaynak ağa geçiliyor',
      estimating: 'Rota hesaplanıyor',
      ready: 'Tahmin hazır',
      approval: 'Approval',
      burn: 'Burn',
      attestation: 'Attestation',
      mint: 'Forwarded mint',
      success: 'Tamamlandı',
      error: 'İşlem gerekli',
    },
    errors: {
      rejected: 'Cüzdan isteği reddedildi.',
      'wrong-source-chain': 'Cüzdan seçili kaynak ağa bağlı değil.',
      'wallet-provider': 'Bağlı cüzdan hesabına erişilemedi.',
      'unsupported-route': 'Bu Arc mainnet bridge rotası Circle tarafından desteklenmiyor.',
      'insufficient-usdc': 'Cüzdanda yeterli USDC yok.',
      'insufficient-gas': 'Kaynak ağdaki native gas bakiyesi yetersiz.',
      'quote-expired': 'Tahminin süresi doldu. Yeni tahmin alın.',
      'rate-limited': 'Circle veya kaynak RPC yoğun. Kısa süre sonra tekrar deneyin.',
      forwarder: 'Circle attestation veya Forwarding Service hedef mint işlemini tamamlayamadı.',
      partial: 'Kaynak işlem başarılı, ancak transfer henüz tamamen bitmedi. Kaydedilen adımları History’den kontrol edin.',
      'service-unavailable': 'Circle bridge servisine erişilemedi.',
      unknown: 'Bridge transferi tamamlanamadı.',
    } satisfies Record<BridgeErrorKind, string>,
  },
} as const;

function eventPhase(payload: unknown): BridgePhase | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = payload as { method?: unknown };
  const method = String(value.method ?? '').toLowerCase();
  if (method.includes('approve')) return 'approval';
  if (method.includes('burn')) return 'burn';
  if (method.includes('attest') || method.includes('message')) return 'attestation';
  if (method.includes('mint') || method.includes('forward')) return 'mint';
  return null;
}

function resultSteps(result?: BridgeResult): BridgeHistoryStep[] {
  return (result?.steps ?? []).map((step) => ({
    name: step.name,
    state: step.state,
    txHash: step.txHash as `0x${string}` | undefined,
    explorerUrl: step.explorerUrl,
    forwarded: step.forwarded,
    batched: step.batched,
    errorMessage: step.errorMessage,
  }));
}

export default function CircleBridge({ language }: { language: Language }) {
  const t = bridgeCopy[language];
  const { address, connector, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const [sourceKey, setSourceKey] = useState<BridgeChainKey>(arcBridgeChain.chain);
  const [destinationKey, setDestinationKey] = useState<BridgeChainKey>(defaultBridgeCounterpart.chain);
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [phase, setPhase] = useState<BridgePhase>('idle');
  const [flowError, setFlowError] = useState('');
  const [clock, setClock] = useState(() => Date.now());
  const [latestResult, setLatestResult] = useState<BridgeResult | null>(null);
  const adapterRef = useRef<{
    account: string;
    chainId: number;
    provider: EIP1193Provider;
    adapter: BrowserAdapter;
  } | null>(null);
  const requestIdRef = useRef(0);

  const source = bridgeChainByKey.get(sourceKey) ?? arcBridgeChain;
  const availableDestinations = useMemo(() => bridgeDestinationsFor(source), [source]);
  const destination = bridgeChainByKey.get(destinationKey) ?? availableDestinations[0] ?? defaultBridgeCounterpart;
  const sourceMatchesWallet = walletChainId === source.chainId;
  const readsEnabled = Boolean(isConnected && address && sourceMatchesWallet);
  const account = address ?? zeroAddress;

  const { data: tokenBalance, refetch: refetchTokenBalance } = useReadContract({
    address: source.usdcAddress as `0x${string}`,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [account],
    chainId: source.chainId,
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });
  const { data: nativeBalance, refetch: refetchNativeBalance } = useBalance({
    address: account,
    chainId: source.chainId,
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });

  const balance = tokenBalance ?? 0n;
  const sourceGasFee = quote?.estimate.gasFees.find((fee) => fee.blockchain === source.chain)?.fees?.fee;
  const sourceGasUnits = sourceGasFee
    ? bridgeGasFeeToNativeUnits(sourceGasFee, source.nativeCurrency.decimals)
    : null;
  const arcGasReserve = sourceGasUnits ? arcNativeGasWeiToTokenUnits(sourceGasUnits) : undefined;
  const maxBalance = isArcBridgeSource(source) ? arcBridgeMaxBalance(balance, arcGasReserve) : balance;
  const inputUnits = parseSwapAmount(amount);
  const quoteFresh = Boolean(quote && isFreshBridgeEstimate(quote.estimatedAt, clock));
  const nativeGasMissing = Boolean(
    readsEnabled
    && inputUnits
    && nativeBalance
    && (
      nativeBalance.value === 0n
      || (sourceGasUnits != null && nativeBalance.value < (sourceGasUnits * 12n + 9n) / 10n)
    )
  );
  const tokenBalanceMissing = Boolean(inputUnits && inputUnits > maxBalance);
  const busy = ['switching', 'estimating', 'approval', 'burn', 'attestation', 'mint'].includes(phase);
  const canSubmit = Boolean(
    isConnected
    && address
    && sourceMatchesWallet
    && inputUnits
    && inputUnits <= maxBalance
    && Boolean(nativeBalance && nativeBalance.value > 0n)
    && !nativeGasMissing
    && quote
    && quoteFresh
    && !busy,
  );

  const getAdapter = useCallback(async () => {
    if (!address) throw new Error('WALLET_NOT_CONNECTED');
    const provider = await connector?.getProvider({ chainId: source.chainId });
    if (!provider || typeof provider !== 'object' || !('request' in provider) || typeof provider.request !== 'function') {
      throw new Error('WALLET_PROVIDER_UNAVAILABLE');
    }
    if (
      adapterRef.current?.account.toLowerCase() === address.toLowerCase()
      && adapterRef.current.chainId === source.chainId
    ) {
      const accounts = await adapterRef.current.provider.request({ method: 'eth_accounts' });
      const activeChain = await adapterRef.current.provider.request({ method: 'eth_chainId' });
      if (!Array.isArray(accounts) || !accounts.some((item) => String(item).toLowerCase() === address.toLowerCase())) {
        throw new Error('WALLET_ACCOUNT_MISMATCH');
      }
      if (Number(BigInt(String(activeChain))) !== source.chainId) throw new Error('WRONG_SOURCE_CHAIN');
      return adapterRef.current.adapter;
    }
    const scoped = createAccountScopedSwapProvider(provider as EIP1193Provider, address) as EIP1193Provider;
    await scoped.request({ method: 'eth_accounts' });
    const activeChain = await scoped.request({ method: 'eth_chainId' });
    if (Number(BigInt(String(activeChain))) !== source.chainId) throw new Error('WRONG_SOURCE_CHAIN');
    const adapter = await createBridgeBrowserAdapter(scoped);
    adapterRef.current = { account: address, chainId: source.chainId, provider: scoped, adapter };
    return adapter;
  }, [address, connector, source.chainId]);

  const estimateBridge = useCallback(async () => {
    const normalized = normalizeSwapAmount(amount);
    if (!address || !isConnected || !sourceMatchesWallet || !normalized || !parseSwapAmount(normalized)) {
      throw new Error(!sourceMatchesWallet ? 'WRONG_SOURCE_CHAIN' : 'INVALID_BRIDGE_AMOUNT');
    }
    if (!isSupportedArcBridgeRoute(source, destination)) throw new Error('UNSUPPORTED_ROUTE');
    const adapter = await getAdapter();
    const estimate = await bridgeKit.estimate({
      from: { adapter, chain: source },
      to: {
        chain: destination,
        recipientAddress: address,
        useForwarder: true,
      },
      amount: normalized,
      token: 'USDC',
      config: { transferSpeed: TransferSpeed.SLOW },
    });
    assertBridgeEstimateIntegrity(estimate, { account: address, amount: normalized, source, destination });
    return estimate;
  }, [address, amount, destination, getAdapter, isConnected, source, sourceMatchesWallet]);

  const refreshEstimate = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setPhase('estimating');
    setFlowError('');
    try {
      const estimate = await estimateBridge();
      if (requestId !== requestIdRef.current) return;
      const estimatedAt = Date.now();
      setQuote({ estimate, estimatedAt });
      setClock(estimatedAt);
      setPhase('ready');
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setQuote(null);
      setPhase('error');
      setFlowError(t.errors[bridgeErrorKind(error)]);
    }
  }, [estimateBridge, t.errors]);

  useEffect(() => {
    if (availableDestinations.some((chain) => chain.chain === destinationKey)) return;
    setDestinationKey(availableDestinations[0]?.chain ?? arcBridgeChain.chain);
  }, [availableDestinations, destinationKey]);

  useEffect(() => {
    adapterRef.current = null;
    requestIdRef.current += 1;
    setQuote(null);
    setLatestResult(null);
    setFlowError('');
    setPhase('idle');
  }, [address, sourceKey, destinationKey]);

  useEffect(() => {
    requestIdRef.current += 1;
    setQuote(null);
    setFlowError('');
    if (!isConnected || !sourceMatchesWallet || !parseSwapAmount(amount)) {
      setPhase('idle');
      return;
    }
    const timeout = window.setTimeout(() => void refreshEstimate(), bridgeEstimateDebounceMs);
    return () => window.clearTimeout(timeout);
  }, [amount, isConnected, refreshEstimate, sourceMatchesWallet]);

  useEffect(() => {
    if (!quote) return;
    const remaining = Math.max(0, quote.estimatedAt + bridgeEstimateTtlMs - Date.now());
    const timeout = window.setTimeout(() => setClock(Date.now()), remaining + 25);
    return () => window.clearTimeout(timeout);
  }, [quote]);

  function changeSource(next: BridgeChainKey) {
    const nextSource = bridgeChainByKey.get(next);
    if (!nextSource) return;
    setSourceKey(next);
    const nextDestinations = bridgeDestinationsFor(nextSource);
    if (!nextDestinations.some((chain) => chain.chain === destinationKey)) {
      setDestinationKey(nextDestinations[0]?.chain ?? arcBridgeChain.chain);
    }
  }

  function flipDirection() {
    const previousSource = source;
    const previousDestination = destination;
    setSourceKey(previousDestination.chain);
    setDestinationKey(previousSource.chain);
  }

  async function switchSourceNetwork() {
    setPhase('switching');
    setFlowError('');
    try {
      await switchChainAsync({ chainId: source.chainId });
      setPhase('idle');
    } catch (error) {
      setPhase('error');
      setFlowError(t.errors[bridgeErrorKind(error)]);
    }
  }

  async function submitBridge() {
    if (!address || !canSubmit) return;
    const bridgeId = crypto.randomUUID();
    let pendingRecord: LocalBridgeHistoryRecord | null = null;
    const handleEvent = (payload: unknown) => {
      const next = eventPhase(payload);
      if (next) setPhase(next);
    };
    bridgeKit.on('*', handleEvent);
    try {
      setPhase('estimating');
      setFlowError('');
      const estimate = await estimateBridge();
      assertBridgeEstimateIntegrity(estimate, { account: address, amount, source, destination });
      const estimatedAt = Date.now();
      setQuote({ estimate, estimatedAt });
      setClock(estimatedAt);

      pendingRecord = {
        bridgeId,
        account: address,
        timestamp: estimatedAt,
        status: 'pending',
        amount: normalizeSwapAmount(amount) ?? amount,
        sourceChain: source.name,
        sourceChainId: source.chainId,
        destinationChain: destination.name,
        destinationChainId: destination.chainId,
        provider: 'Circle CCTP V2',
        fees: estimate.fees.map((fee) => `${fee.type}: ${fee.amount ?? '—'} ${fee.token}`),
        steps: [],
      };
      saveLocalBridgeHistory(pendingRecord);

      const adapter = await getAdapter();
      setPhase('approval');
      const result = await bridgeKit.bridge({
        from: { adapter, chain: source },
        to: {
          chain: destination,
          recipientAddress: address,
          useForwarder: true,
        },
        amount: normalizeSwapAmount(amount) ?? amount,
        token: 'USDC',
        config: { transferSpeed: TransferSpeed.SLOW },
      });
      setLatestResult(result);
      saveLocalBridgeHistory({
        ...pendingRecord,
        status: result.state === 'success' ? 'confirmed' : result.state === 'error' ? 'failed' : 'pending',
        provider: result.provider,
        steps: resultSteps(result),
      });
      setPhase(result.state === 'success' ? 'success' : result.state === 'error' ? 'error' : 'mint');
      if (result.state === 'error') setFlowError(t.errors.partial);
      void Promise.all([refetchTokenBalance(), refetchNativeBalance()]);
    } catch (error) {
      const partialResult = (error && typeof error === 'object' && 'result' in error)
        ? (error as { result?: BridgeResult }).result
        : undefined;
      if (pendingRecord) {
        saveLocalBridgeHistory({
          ...pendingRecord,
          status: partialResult?.state === 'success' ? 'confirmed' : partialResult?.steps?.length ? 'pending' : 'failed',
          provider: partialResult?.provider ?? pendingRecord.provider,
          steps: resultSteps(partialResult),
        });
      }
      setLatestResult(partialResult ?? null);
      setPhase('error');
      const kind = partialResult?.steps?.length ? 'partial' : bridgeErrorKind(error);
      setFlowError(t.errors[kind]);
    } finally {
      bridgeKit.off('*', handleEvent);
    }
  }

  const gasRows = quote?.estimate.gasFees ?? [];
  const feeRows = quote?.estimate.fees ?? [];
  const connectedNetwork = bridgeChainById.get(walletChainId)?.name;

  return (
    <section className="panel min-h-[680px] overflow-hidden">
      <div className="panel-header gap-3">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 className="panel-title">{t.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t.description}</p>
        </div>
        <span className={`status-badge ${phase === 'error' ? 'status-badge-error' : phase === 'success' ? 'status-badge-success' : ''}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : phase === 'success' ? <CheckCircle2 size={14} /> : <Route size={14} />}
          {t.steps[phase]}
        </span>
      </div>

      <div className="mx-auto grid w-full max-w-4xl gap-4 p-4 sm:p-6">
        {!isConnected ? (
          <div className="helper-warning flex items-start gap-2"><WalletCards size={17} />{t.disconnected}</div>
        ) : null}
        {isConnected && !sourceMatchesWallet ? (
          <div className="helper-warning flex flex-wrap items-center justify-between gap-3">
            <span>{t.wrongSource} {connectedNetwork ? `(${connectedNetwork})` : ''}</span>
            <button type="button" onClick={() => void switchSourceNetwork()} disabled={busy} className="btn-ghost h-9 px-3">
              {t.switchNetwork}
            </button>
          </div>
        ) : null}
        {flowError ? <div className="helper-warning" role="alert">{flowError}</div> : null}
        {!flowError && tokenBalanceMissing ? <div className="helper-warning" role="alert">{t.errors['insufficient-usdc']}</div> : null}
        {!flowError && nativeGasMissing ? <div className="helper-warning" role="alert">{t.errors['insufficient-gas']}</div> : null}

        <div className="grid items-end gap-3 md:grid-cols-[1fr_auto_1fr]">
          <label className="grid gap-2 text-sm text-zinc-400">
            {t.source}
            <select className="input" value={sourceKey} onChange={(event) => changeSource(event.target.value as BridgeChainKey)} disabled={busy}>
              {bridgeEvmChains.map((chain) => <option key={chain.chain} value={chain.chain}>{chain.name}</option>)}
            </select>
          </label>
          <button type="button" onClick={flipDirection} disabled={busy} className="btn-ghost h-11 w-11" aria-label={`${t.source} / ${t.destination}`}>
            <ArrowDownUp size={17} className="md:rotate-90" />
          </button>
          <label className="grid gap-2 text-sm text-zinc-400">
            {t.destination}
            <select className="input" value={destination.chain} onChange={(event) => setDestinationKey(event.target.value as BridgeChainKey)} disabled={busy}>
              {availableDestinations.map((chain) => <option key={chain.chain} value={chain.chain}>{chain.name}</option>)}
            </select>
          </label>
        </div>

        <div className="surface grid gap-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{t.balance}: {formatSwapUnits(balance)} USDC</span>
            <span>
              {t.nativeBalance}: {nativeBalance
                ? `${Number(formatUnits(nativeBalance.value, nativeBalance.decimals)).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 6 })} ${nativeBalance.symbol}`
                : `0 ${source.nativeCurrency.symbol}`}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_130px]">
            <div className="relative">
              <input
                className="input pr-20 text-lg font-semibold"
                value={amount}
                inputMode="decimal"
                autoComplete="off"
                placeholder="0.00"
                onChange={(event) => {
                  if (isSwapAmountInput(event.target.value)) setAmount(event.target.value);
                }}
                disabled={!isConnected || !sourceMatchesWallet || busy}
                aria-label={t.amount}
              />
              <button
                type="button"
                onClick={() => setAmount(formatSwapUnits(maxBalance))}
                disabled={!readsEnabled || maxBalance === 0n || busy}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40"
              >
                {t.max}
              </button>
            </div>
            <div className="input flex items-center font-semibold">USDC</div>
          </div>
          <div className="rounded-md bg-zinc-950 px-3 py-2">
            <span className="text-[11px] uppercase tracking-wide text-zinc-600">{t.recipient}</span>
            <p className="mt-1 break-all font-mono text-xs text-zinc-300">{address ?? '—'}</p>
            <p className="mt-1 text-xs text-zinc-600">{t.connectedRecipient}</p>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
          <QuoteRow label={t.provider} value="Circle CCTP V2 · Forwarding Service" />
          <QuoteRow label={t.standard} value={t.standardHelp} />
          {quote ? (
            <>
              <QuoteRow
                label={t.fees}
                value={feeRows.length ? feeRows.map((fee) => `${fee.type}: ${fee.amount ?? '—'} ${fee.token}`).join(' · ') : t.noFees}
              />
              <QuoteRow
                label={t.gas}
                value={gasRows.length
                  ? gasRows.map((fee) => {
                    const gasChain = bridgeChainByKey.get(fee.blockchain as BridgeChainKey);
                    const decimals = gasChain?.nativeCurrency.decimals ?? 18;
                    const gasUnits = fee.fees
                      ? bridgeGasFeeToNativeUnits(fee.fees.fee, decimals)
                      : null;
                    return `${fee.name}: ${gasUnits != null ? formatUnits(gasUnits, decimals) : '—'} ${fee.token}`;
                  }).join(' · ')
                  : t.noFees}
              />
              <QuoteRow label={t.total} value={`${formatSwapUnits((inputUnits ?? 0n) + bridgeFeeTotal(feeRows))} USDC`} />
              {!quoteFresh ? <p className="text-xs text-amber-300">{t.expired}</p> : null}
            </>
          ) : <p className="text-xs text-zinc-500">{t.noEstimate}</p>}
        </div>

        <p className="text-xs leading-5 text-zinc-600">{t.batch}</p>
        <button type="button" onClick={() => void submitBridge()} disabled={!canSubmit} className="btn-primary h-12 w-full">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Route size={16} />}
          {t.submit}
        </button>

        {['approval', 'burn', 'attestation', 'mint'].includes(phase) ? <p className="text-center text-xs text-zinc-500">{t.pending}</p> : null}

        {latestResult?.steps?.length ? (
          <div className="grid gap-2">
            {latestResult.steps.map((step, index) => (
              <div key={`${step.name}-${index}`} className="surface flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                <span className="text-zinc-300">{step.name} · {step.state}{step.batched ? ' · batched' : ''}{step.forwarded ? ' · forwarded' : ''}</span>
                {step.explorerUrl ? (
                  <a href={step.explorerUrl} target="_blank" rel="noreferrer" className="text-accent inline-flex items-center gap-1">
                    Explorer <ExternalLink size={12} />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 sm:flex-row sm:gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-left text-xs text-zinc-300 sm:max-w-[65%] sm:text-right">{value}</span>
    </div>
  );
}
