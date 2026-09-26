'use client';

import {
  ArrowDownUp,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EIP1193Provider } from 'viem';
import { createPublicClient, http, parseAbi, zeroAddress } from 'viem';
import {
  useAccount,
  useChainId,
  useGasPrice,
  useReadContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import {
  Blockchain,
  SwapChain,
  SwapKit,
  getChainByEnum,
  type SwapEstimate,
} from '@circle-fin/swap-kit';
import { arcNetwork, transactionUrl } from '../lib/chain';
import {
  arcSwapTokens,
  assertSwapEstimateIntegrity,
  circleSwapProxyUrl,
  createAccountScopedSwapProvider,
  defaultSwapSlippageBps,
  estimateGasReserveUsdc,
  formatSwapUnits,
  isFreshSwapQuote,
  isSwapAmountInput,
  maxSpendableSwapBalance,
  normalizeSwapAmount,
  parseSwapAmount,
  quoteExchangeRate,
  swapErrorKind,
  swapQuoteDebounceMs,
  swapQuoteTtlMs,
  type SwapErrorKind,
  type SwapTokenSymbol,
} from '../lib/circleSwap';
import { saveLocalSwapHistory, updateLocalSwapStatus } from '../lib/history';
import { rpcProxyPath } from '../lib/rpcProxy';
import type { Language } from './arcanumCopy';

type SwapPhase = 'idle' | 'quoting' | 'ready' | 'wallet' | 'pending' | 'success' | 'error';
type BrowserAdapter = Awaited<ReturnType<typeof createArcBrowserAdapter>>;
type QuoteState = {
  estimate: SwapEstimate;
  quotedAt: number;
};

const erc20BalanceAbi = parseAbi([
  'function balanceOf(address account) view returns (uint256)',
]);
const swapKit = new SwapKit({ disableErrorReporting: true });
const arcCircleChain = getChainByEnum(Blockchain.Arc);
const slippageOptions = [10, 50, 100] as const;
const circleFetchProxyFlag = '__arcanumCircleFetchProxyInstalled';

function installCircleFetchProxy() {
  const browserWindow = window as Window & {
    __arcanumCircleFetchProxyInstalled?: boolean;
  };
  if (browserWindow[circleFetchProxyFlag]) return;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const requestUrl = input instanceof Request ? input.url : input.toString();
    const proxyUrl = circleSwapProxyUrl(requestUrl, window.location.origin);
    if (!proxyUrl) return nativeFetch(input, init);

    if (input instanceof Request) {
      return nativeFetch(new Request(proxyUrl, input), init);
    }
    return nativeFetch(proxyUrl, init);
  };
  browserWindow[circleFetchProxyFlag] = true;
}

function createArcBrowserAdapter(provider: EIP1193Provider) {
  return createViemAdapterFromProvider({
    provider,
    getPublicClient: ({ chain }) => createPublicClient({
      chain,
      transport: http(rpcProxyPath(chain.id)),
    }),
    capabilities: {
      addressContext: 'user-controlled',
      supportedChains: [arcCircleChain],
    },
  });
}

const swapCopy = {
  en: {
    title: 'Swap',
    eyebrow: 'Circle Swap on Arc Mainnet',
    description: 'Swap USDC and EURC through Circle’s permissionless Arc mainnet route.',
    connected: 'Ready',
    disconnected: 'Connect your wallet to request a quote.',
    wrongChain: 'Switch your wallet to Arc mainnet to continue.',
    from: 'You pay',
    to: 'You receive',
    balance: 'Balance',
    max: 'Max',
    amount: 'Amount',
    estimated: 'Estimated amount',
    refresh: 'Refresh quote',
    noQuote: 'Enter an amount to request a live quote.',
    quoteExpired: 'This quote expired. Refresh it before swapping.',
    rate: 'Rate',
    minimum: 'Minimum received',
    slippage: 'Slippage',
    fees: 'Provider fees',
    noFees: 'No provider fee reported',
    gasReserve: 'USDC gas reserve',
    gasReserveHelp: 'A buffered reserve is kept because Arc uses native USDC for gas.',
    route: 'Route',
    routeValue: 'Circle Stablecoin Service',
    swap: 'Swap',
    swapping: 'Confirm in wallet',
    pending: 'Transaction pending',
    success: 'Swap completed',
    approval: 'Permit is preferred; the SDK falls back to ERC-20 approval when needed.',
    statusIdle: 'Waiting for amount',
    statusQuoting: 'Requesting quote',
    statusReady: 'Quote ready',
    statusWallet: 'Wallet confirmation',
    statusPending: 'Confirming on Arc',
    statusSuccess: 'Completed',
    statusError: 'Action needed',
    errors: {
      rejected: 'The wallet request was rejected.',
      'wrong-chain': 'The wallet is not connected to Arc mainnet.',
      'wallet-provider': 'The connected wallet account could not be accessed. Reconnect the wallet and try again.',
      'service-unavailable': 'The Circle quote service could not be reached. Please retry in a moment.',
      'insufficient-balance': 'The wallet does not have enough token balance or native USDC for gas.',
      'quote-expired': 'The quote expired. Request a new quote.',
      'rate-limited': 'The Arc or Circle service is busy. Please try again shortly.',
      'route-unavailable': 'No USDC/EURC route is available for this amount right now.',
      unknown: 'The swap could not be completed.',
    } satisfies Record<SwapErrorKind, string>,
  },
  tr: {
    title: 'Swap',
    eyebrow: 'Arc Mainnet üzerinde Circle Swap',
    description: 'USDC ve EURC’yi Circle’ın izinsiz Arc mainnet rotası üzerinden takas edin.',
    connected: 'Hazır',
    disconnected: 'Fiyat almak için cüzdanınızı bağlayın.',
    wrongChain: 'Devam etmek için cüzdanınızı Arc mainnet’e geçirin.',
    from: 'Ödeyeceğiniz',
    to: 'Alacağınız',
    balance: 'Bakiye',
    max: 'Maks.',
    amount: 'Miktar',
    estimated: 'Tahmini miktar',
    refresh: 'Fiyatı yenile',
    noQuote: 'Canlı fiyat almak için bir miktar girin.',
    quoteExpired: 'Bu fiyatın süresi doldu. Swap öncesinde yenileyin.',
    rate: 'Kur',
    minimum: 'Minimum alınacak',
    slippage: 'Slippage',
    fees: 'Sağlayıcı ücretleri',
    noFees: 'Sağlayıcı ücreti bildirilmedi',
    gasReserve: 'USDC gas rezervi',
    gasReserveHelp: 'Arc gas için native USDC kullandığından tamponlu bir rezerv bırakılır.',
    route: 'Rota',
    routeValue: 'Circle Stablecoin Service',
    swap: 'Swap yap',
    swapping: 'Cüzdanda onaylayın',
    pending: 'İşlem bekleniyor',
    success: 'Swap tamamlandı',
    approval: 'Önce permit denenir; gerekirse SDK otomatik ERC-20 approval kullanır.',
    statusIdle: 'Miktar bekleniyor',
    statusQuoting: 'Fiyat alınıyor',
    statusReady: 'Fiyat hazır',
    statusWallet: 'Cüzdan onayı',
    statusPending: 'Arc üzerinde onaylanıyor',
    statusSuccess: 'Tamamlandı',
    statusError: 'İşlem gerekli',
    errors: {
      rejected: 'Cüzdan isteği reddedildi.',
      'wrong-chain': 'Cüzdan Arc mainnet’e bağlı değil.',
      'wallet-provider': 'Bağlı cüzdan hesabına erişilemedi. Cüzdanı yeniden bağlayıp tekrar deneyin.',
      'service-unavailable': 'Circle fiyat servisine erişilemedi. Kısa süre sonra tekrar deneyin.',
      'insufficient-balance': 'Token bakiyesi veya gas için native USDC yetersiz.',
      'quote-expired': 'Fiyatın süresi doldu. Yeni fiyat alın.',
      'rate-limited': 'Arc veya Circle servisi yoğun. Kısa süre sonra yeniden deneyin.',
      'route-unavailable': 'Bu miktar için şu anda USDC/EURC rotası bulunamadı.',
      unknown: 'Swap tamamlanamadı.',
    } satisfies Record<SwapErrorKind, string>,
  },
} as const;

function phaseLabel(phase: SwapPhase, language: Language) {
  const t = swapCopy[language];
  const labels: Record<SwapPhase, string> = {
    idle: t.statusIdle,
    quoting: t.statusQuoting,
    ready: t.statusReady,
    wallet: t.statusWallet,
    pending: t.statusPending,
    success: t.statusSuccess,
    error: t.statusError,
  };
  return labels[phase];
}

function readableSwapError(error: unknown, language: Language) {
  return swapCopy[language].errors[swapErrorKind(error)];
}

export default function CircleSwap({ language }: { language: Language }) {
  const t = swapCopy[language];
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const isCorrectChain = chainId === arcNetwork.id;
  const adapterRef = useRef<{ account: string; adapter: BrowserAdapter } | null>(null);
  const requestIdRef = useRef(0);

  const [tokenIn, setTokenIn] = useState<SwapTokenSymbol>('USDC');
  const [tokenOut, setTokenOut] = useState<SwapTokenSymbol>('EURC');
  const [amount, setAmount] = useState('');
  const [slippageBps, setSlippageBps] = useState(defaultSwapSlippageBps);
  const [quote, setQuote] = useState<QuoteState | null>(null);
  const [phase, setPhase] = useState<SwapPhase>('idle');
  const [flowError, setFlowError] = useState('');
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [lastHash, setLastHash] = useState<`0x${string}` | undefined>();
  const [clock, setClock] = useState(() => Date.now());

  const readsEnabled = isConnected && isCorrectChain && Boolean(address);
  const account = address ?? zeroAddress;
  const { data: usdcBalance, refetch: refetchUsdc } = useReadContract({
    address: arcSwapTokens.USDC.address,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [account],
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });
  const { data: eurcBalance, refetch: refetchEurc } = useReadContract({
    address: arcSwapTokens.EURC.address,
    abi: erc20BalanceAbi,
    functionName: 'balanceOf',
    args: [account],
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });
  const { data: gasPrice } = useGasPrice({
    chainId: arcNetwork.id,
    query: { enabled: readsEnabled, refetchInterval: 15_000 },
  });
  const receipt = useWaitForTransactionReceipt({
    hash: pendingHash,
    query: { enabled: Boolean(pendingHash) },
  });

  useEffect(() => {
    installCircleFetchProxy();
  }, []);

  const balances = useMemo<Record<SwapTokenSymbol, bigint>>(() => ({
    USDC: usdcBalance ?? 0n,
    EURC: eurcBalance ?? 0n,
  }), [eurcBalance, usdcBalance]);
  const inputUnits = parseSwapAmount(amount);
  const inputBalance = balances[tokenIn];
  const maxInputBalance = maxSpendableSwapBalance(tokenIn, inputBalance, gasPrice);
  const quoteFresh = Boolean(quote && isFreshSwapQuote(quote.quotedAt, clock));
  const quoteRate = quote
    ? quoteExchangeRate(quote.estimate.amountIn, quote.estimate.estimatedOutput.amount)
    : null;
  const busy = phase === 'quoting' || phase === 'wallet' || phase === 'pending';
  const canSwap = Boolean(
    isConnected
    && isCorrectChain
    && address
    && inputUnits
    && inputUnits <= maxInputBalance
    && quote
    && quoteFresh
    && !busy,
  );
  const transactionHash = lastHash ?? pendingHash;
  const txUrl = transactionHash ? transactionUrl(transactionHash, arcNetwork) : undefined;

  const getAdapter = useCallback(async () => {
    if (!address) throw new Error('WALLET_NOT_CONNECTED');
    const connectorProvider = await connector?.getProvider({
      chainId: arcNetwork.id,
    });
    if (
      !connectorProvider
      || typeof connectorProvider !== 'object'
      || !('request' in connectorProvider)
      || typeof connectorProvider.request !== 'function'
    ) {
      throw new Error('WALLET_PROVIDER_UNAVAILABLE');
    }

    if (adapterRef.current?.account.toLowerCase() === address.toLowerCase()) {
      return adapterRef.current.adapter;
    }

    const provider = createAccountScopedSwapProvider(
      connectorProvider as EIP1193Provider,
      address,
    ) as EIP1193Provider;
    const adapter = await createArcBrowserAdapter(provider);
    adapterRef.current = { account: address, adapter };
    return adapter;
  }, [address, connector]);

  const requestQuote = useCallback(async () => {
    const normalizedAmount = normalizeSwapAmount(amount);
    if (!address || !isConnected || !isCorrectChain || !normalizedAmount || !parseSwapAmount(normalizedAmount)) {
      throw new Error(!isCorrectChain ? 'WRONG_CHAIN' : 'INVALID_SWAP_AMOUNT');
    }

    const adapter = await getAdapter();
    const estimate = await swapKit.estimate({
      from: { adapter, chain: SwapChain.Arc },
      tokenIn,
      tokenOut,
      amountIn: normalizedAmount,
      config: {
        allowanceStrategy: 'permit',
        slippageBps,
      },
    });

    assertSwapEstimateIntegrity(estimate, {
      account: address,
      amountIn: normalizedAmount,
      tokenIn,
      tokenOut,
    });
    return estimate;
  }, [address, amount, getAdapter, isConnected, isCorrectChain, slippageBps, tokenIn, tokenOut]);

  const refreshQuote = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setFlowError('');
    setPhase('quoting');

    try {
      const estimate = await requestQuote();
      if (requestId !== requestIdRef.current) return;
      const quotedAt = Date.now();
      setQuote({ estimate, quotedAt });
      setClock(quotedAt);
      setPhase('ready');
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error('[CircleSwap] Quote failed', error);
      setQuote(null);
      setPhase('error');
      setFlowError(readableSwapError(error, language));
    }
  }, [language, requestQuote]);

  useEffect(() => {
    adapterRef.current = null;
    setQuote(null);
    setPendingHash(undefined);
    setPhase('idle');
    setFlowError('');
  }, [address]);

  useEffect(() => {
    requestIdRef.current += 1;
    setQuote(null);
    setFlowError('');

    if (!isConnected || !isCorrectChain || !parseSwapAmount(amount)) {
      setPhase('idle');
      return;
    }

    const timeout = window.setTimeout(() => {
      void refreshQuote();
    }, swapQuoteDebounceMs);
    return () => window.clearTimeout(timeout);
  }, [amount, isConnected, isCorrectChain, refreshQuote, slippageBps, tokenIn, tokenOut]);

  useEffect(() => {
    if (!quote) return;
    const remaining = Math.max(0, quote.quotedAt + swapQuoteTtlMs - Date.now());
    const timeout = window.setTimeout(() => setClock(Date.now()), remaining + 25);
    return () => window.clearTimeout(timeout);
  }, [quote]);

  useEffect(() => {
    if (!receipt.isSuccess) return;
    if (address && pendingHash) updateLocalSwapStatus(address, pendingHash, 'confirmed');
    setPhase('success');
    setPendingHash(undefined);
    void Promise.all([refetchUsdc(), refetchEurc()]);
  }, [address, pendingHash, receipt.isSuccess, refetchEurc, refetchUsdc]);

  useEffect(() => {
    if (!receipt.isError || !receipt.error) return;
    if (address && pendingHash) updateLocalSwapStatus(address, pendingHash, 'failed');
    setPhase('error');
    setFlowError(readableSwapError(receipt.error, language));
  }, [address, language, pendingHash, receipt.error, receipt.isError]);

  function flipTokens() {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    if (quote?.estimate.estimatedOutput.amount) {
      setAmount(quote.estimate.estimatedOutput.amount);
    }
    setQuote(null);
    setFlowError('');
    setPhase('idle');
  }

  function useMaximum() {
    setAmount(formatSwapUnits(maxInputBalance));
  }

  async function submitSwap() {
    if (!address || !canSwap) return;

    setFlowError('');
    setPhase('quoting');

    try {
      const latestEstimate = await requestQuote();
      assertSwapEstimateIntegrity(latestEstimate, {
        account: address,
        amountIn: amount,
        tokenIn,
        tokenOut,
      });
      const quotedAt = Date.now();
      setQuote({ estimate: latestEstimate, quotedAt });
      setClock(quotedAt);

      const adapter = await getAdapter();
      setPhase('wallet');
      const result = await swapKit.swap({
        from: { adapter, chain: SwapChain.Arc },
        tokenIn,
        tokenOut,
        amountIn: normalizeSwapAmount(amount) ?? amount,
        config: {
          allowanceStrategy: 'permit',
          slippageBps,
          stopLimit: latestEstimate.stopLimit.amount,
        },
      });

      assertSwapEstimateIntegrity(result, {
        account: address,
        amountIn: amount,
        tokenIn,
        tokenOut,
      });

      const hash = result.txHash as `0x${string}`;
      saveLocalSwapHistory({
        chainId: arcNetwork.id,
        address,
        timestamp: Date.now(),
        status: result.progress.status === 'DONE' ? 'confirmed' : 'pending',
        txHash: hash,
        tokenIn,
        tokenOut,
        amountIn: result.amountIn,
        amountOut: latestEstimate.estimatedOutput.amount,
        minimumOut: latestEstimate.stopLimit.amount,
        fees: latestEstimate.fees?.map((fee) => `${fee.amount ?? '—'} ${fee.token}`),
      });
      setLastHash(hash);
      if (result.progress.status === 'DONE') {
        setPhase('success');
        void Promise.all([refetchUsdc(), refetchEurc()]);
      } else {
        setPendingHash(hash);
        setPhase('pending');
      }
    } catch (error) {
      console.error('[CircleSwap] Swap failed', error);
      setPhase('error');
      setFlowError(readableSwapError(error, language));
    }
  }

  const availabilityMessage = !isConnected ? t.disconnected : !isCorrectChain ? t.wrongChain : '';
  const phaseText = phaseLabel(phase, language);
  const gasReserve = estimateGasReserveUsdc(gasPrice);

  return (
    <section className="panel min-h-[680px] overflow-hidden">
      <div className="panel-header">
        <div>
          <p className="eyebrow">{t.eyebrow}</p>
          <h2 className="panel-title">{t.title}</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">{t.description}</p>
        </div>
        <span className={`status-badge ${phase === 'error' ? 'status-badge-error' : phase === 'success' ? 'status-badge-success' : ''}`}>
          {phase === 'quoting' || phase === 'wallet' || phase === 'pending'
            ? <Loader2 size={14} className="animate-spin" />
            : phase === 'success'
              ? <CheckCircle2 size={14} />
              : <CircleDollarSign size={14} />}
          {phaseText}
        </span>
      </div>

      <div className="mx-auto grid w-full max-w-3xl gap-4 p-4 sm:p-6">
        {availabilityMessage ? (
          <div className="helper-warning flex items-start gap-2">
            <WalletCards size={17} className="mt-0.5 shrink-0" />
            <span>{availabilityMessage}</span>
          </div>
        ) : null}

        {flowError ? (
          <div className="helper-warning" role="alert">{flowError}</div>
        ) : null}

        <div className="surface grid gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <label htmlFor="swap-amount" className="text-sm font-medium text-zinc-300">{t.from}</label>
            <span className="text-xs text-zinc-500">
              {t.balance}: {formatSwapUnits(inputBalance)} {tokenIn}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="relative">
              <input
                id="swap-amount"
                className="input pr-20 text-lg font-semibold"
                inputMode="decimal"
                autoComplete="off"
                value={amount}
                onChange={(event) => {
                  if (isSwapAmountInput(event.target.value)) setAmount(event.target.value);
                }}
                placeholder="0.00"
                disabled={!isConnected || !isCorrectChain || busy}
              />
              <button
                type="button"
                onClick={useMaximum}
                disabled={!isConnected || !isCorrectChain || maxInputBalance === 0n || busy}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/10 disabled:opacity-40"
              >
                {t.max}
              </button>
            </div>
            <select
              className="input font-semibold"
              value={tokenIn}
              onChange={(event) => {
                const next = event.target.value as SwapTokenSymbol;
                setTokenIn(next);
                setTokenOut(next === 'USDC' ? 'EURC' : 'USDC');
              }}
              disabled={busy}
              aria-label={t.from}
            >
              <option value="USDC">USDC</option>
              <option value="EURC">EURC</option>
            </select>
          </div>
        </div>

        <div className="flex justify-center -my-1">
          <button
            type="button"
            onClick={flipTokens}
            disabled={busy}
            className="btn-ghost h-10 w-10 rounded-full"
            aria-label={`${t.from} / ${t.to}`}
          >
            <ArrowDownUp size={17} />
          </button>
        </div>

        <div className="surface grid gap-3 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-zinc-300">{t.to}</span>
            <span className="text-xs text-zinc-500">
              {t.balance}: {formatSwapUnits(balances[tokenOut])} {tokenOut}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
            <div className="input flex items-center text-lg font-semibold">
              {quote?.estimate.estimatedOutput.amount ?? '0.00'}
            </div>
            <select
              className="input font-semibold"
              value={tokenOut}
              onChange={(event) => {
                const next = event.target.value as SwapTokenSymbol;
                setTokenOut(next);
                setTokenIn(next === 'USDC' ? 'EURC' : 'USDC');
              }}
              disabled={busy}
              aria-label={t.to}
            >
              <option value="EURC">EURC</option>
              <option value="USDC">USDC</option>
            </select>
          </div>
        </div>

        <div className="grid gap-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-zinc-500">{t.slippage}</span>
            <select
              className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-200"
              value={slippageBps}
              onChange={(event) => setSlippageBps(Number(event.target.value))}
              disabled={busy}
            >
              {slippageOptions.map((value) => (
                <option key={value} value={value}>{(value / 100).toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US')}%</option>
              ))}
            </select>
          </div>

          {quote ? (
            <>
              <QuoteRow
                label={t.rate}
                value={quoteRate ? `1 ${tokenIn} ≈ ${quoteRate.toLocaleString(language === 'tr' ? 'tr-TR' : 'en-US', { maximumFractionDigits: 6 })} ${tokenOut}` : '—'}
              />
              <QuoteRow label={t.minimum} value={`${quote.estimate.stopLimit.amount} ${tokenOut}`} />
              <QuoteRow
                label={t.fees}
                value={quote.estimate.fees?.length
                  ? quote.estimate.fees.map((fee) => `${fee.amount ?? '—'} ${fee.token}`).join(' · ')
                  : t.noFees}
              />
              <QuoteRow label={t.route} value={t.routeValue} />
              {!quoteFresh ? <p className="text-xs text-amber-300">{t.quoteExpired}</p> : null}
            </>
          ) : (
            <p className="text-xs text-zinc-500">{t.noQuote}</p>
          )}

          <div className="flex items-start justify-between gap-4 border-t border-zinc-800 pt-3">
            <div>
              <p className="text-zinc-500">{t.gasReserve}</p>
              <p className="mt-1 text-xs text-zinc-600">{t.gasReserveHelp}</p>
            </div>
            <span className="shrink-0 font-mono text-xs text-zinc-300">{formatSwapUnits(gasReserve)} USDC</span>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <button
            type="button"
            onClick={() => void submitSwap()}
            disabled={!canSwap}
            className="btn-primary h-12 px-5"
          >
            {phase === 'wallet'
              ? <><Loader2 size={16} className="animate-spin" />{t.swapping}</>
              : phase === 'pending'
                ? <><Loader2 size={16} className="animate-spin" />{t.pending}</>
                : phase === 'success'
                  ? <><CheckCircle2 size={16} />{t.success}</>
                  : <><ArrowDownUp size={16} />{t.swap}</>}
          </button>
          <button
            type="button"
            onClick={() => void refreshQuote()}
            disabled={!isConnected || !isCorrectChain || !inputUnits || busy}
            className="btn-ghost h-12 px-4"
          >
            <RefreshCw size={15} className={phase === 'quoting' ? 'animate-spin' : ''} />
            {t.refresh}
          </button>
        </div>

        <div className="flex items-start gap-2 text-xs text-zinc-500">
          <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-300" />
          <span>{t.approval}</span>
        </div>

        {txUrl ? (
          <a href={txUrl} target="_blank" rel="noreferrer" className="btn-ghost h-10 justify-self-start px-3 text-xs">
            <ExternalLink size={14} />
            Arc Explorer
          </a>
        ) : null}

      </div>
    </section>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="text-zinc-500">{label}</span>
      <span className="text-right text-zinc-300">{value}</span>
    </div>
  );
}
