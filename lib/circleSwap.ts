export const arcSwapChainId = 5042002;
export const circleSwapChain = 'Arc_Testnet' as const;
export const swapTokenDecimals = 6;
export const defaultSwapSlippageBps = 50;
export const swapQuoteTtlMs = 30_000;
export const swapQuoteDebounceMs = 500;
export const gasBufferBps = 12_000n;
export const assumedSwapGasUnits = 750_000n;
export const fallbackGasReserveUsdc = 50_000n;

export type SwapTokenSymbol = 'USDC' | 'EURC';
export type SwapErrorKind =
  | 'rejected'
  | 'wrong-chain'
  | 'insufficient-balance'
  | 'quote-expired'
  | 'rate-limited'
  | 'route-unavailable'
  | 'unknown';

export type SwapToken = {
  symbol: SwapTokenSymbol;
  name: string;
  address: `0x${string}`;
  decimals: 6;
};

export type SwapEstimateIntegrity = {
  amountIn: string;
  chainIn: string;
  chainOut: string;
  fromAddress: string;
  toAddress: string;
  tokenIn: string;
  tokenOut: string;
};

export const arcSwapTokens: Record<SwapTokenSymbol, SwapToken> = {
  USDC: {
    symbol: 'USDC',
    name: 'USD Coin',
    address: '0x3600000000000000000000000000000000000000',
    decimals: swapTokenDecimals,
  },
  EURC: {
    symbol: 'EURC',
    name: 'Euro Coin',
    address: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a',
    decimals: swapTokenDecimals,
  },
};

const decimalAmountPattern = /^\d*(?:\.\d{0,6})?$/;

function ceilDivide(value: bigint, divisor: bigint) {
  return (value + divisor - 1n) / divisor;
}

function errorText(error: unknown, seen = new Set<unknown>()): string {
  if (error == null || seen.has(error)) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);

  seen.add(error);
  const value = error as {
    cause?: unknown;
    details?: unknown;
    message?: unknown;
    shortMessage?: unknown;
  };

  return [value.shortMessage, value.details, value.message]
    .filter((part): part is string => typeof part === 'string')
    .concat(errorText(value.cause, seen))
    .join(' ');
}

export function isSwapAmountInput(value: string) {
  return decimalAmountPattern.test(value);
}

export function normalizeSwapAmount(value: string) {
  const trimmed = value.trim();
  if (!decimalAmountPattern.test(trimmed) || !trimmed || trimmed === '.') return null;

  const [whole = '0', fraction = ''] = trimmed.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '') || '0';
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
}

export function parseSwapAmount(value: string) {
  const normalized = normalizeSwapAmount(value);
  if (!normalized) return null;

  const [whole, fraction = ''] = normalized.split('.');
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(swapTokenDecimals, '0'));
  return units > 0n ? units : null;
}

export function formatSwapUnits(value: bigint, maximumFractionDigits = swapTokenDecimals) {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 1_000_000n;
  const fraction = (absolute % 1_000_000n)
    .toString()
    .padStart(swapTokenDecimals, '0')
    .slice(0, maximumFractionDigits)
    .replace(/0+$/, '');
  const formatted = fraction ? `${whole}.${fraction}` : whole.toString();
  return negative ? `-${formatted}` : formatted;
}

export function isFreshSwapQuote(quotedAt: number, now = Date.now()) {
  return quotedAt > 0 && now >= quotedAt && now - quotedAt < swapQuoteTtlMs;
}

export function estimateGasReserveUsdc(gasPriceWei?: bigint, gasUnits = assumedSwapGasUnits) {
  if (!gasPriceWei || gasPriceWei <= 0n) return fallbackGasReserveUsdc;

  const bufferedWei = ceilDivide(gasPriceWei * gasUnits * gasBufferBps, 10_000n);
  const reserveInSixDecimals = ceilDivide(bufferedWei, 1_000_000_000_000n);
  return reserveInSixDecimals > fallbackGasReserveUsdc ? reserveInSixDecimals : fallbackGasReserveUsdc;
}

export function maxSpendableSwapBalance(
  token: SwapTokenSymbol,
  tokenBalance: bigint,
  gasPriceWei?: bigint,
) {
  if (token !== 'USDC') return tokenBalance;
  const reserve = estimateGasReserveUsdc(gasPriceWei);
  return tokenBalance > reserve ? tokenBalance - reserve : 0n;
}

export function quoteExchangeRate(amountIn: string, amountOut: string) {
  const inputUnits = parseSwapAmount(amountIn);
  const outputUnits = parseSwapAmount(amountOut);
  if (!inputUnits || !outputUnits) return null;

  return Number(outputUnits) / Number(inputUnits);
}

export function swapErrorKind(error: unknown): SwapErrorKind {
  const text = errorText(error).toLowerCase();

  if (/reject|denied|declined|cancelled|canceled/.test(text)) return 'rejected';
  if (/wrong chain|chain mismatch|unsupported chain|switch chain/.test(text)) return 'wrong-chain';
  if (/insufficient|exceeds balance|not enough funds|funds for gas/.test(text)) return 'insufficient-balance';
  if (/expired|stale quote|quote.*invalid/.test(text)) return 'quote-expired';
  if (/rate limit|too many requests|\b429\b|request limit reached/.test(text)) return 'rate-limited';
  if (/no route|route unavailable|not supported|unsupported route|liquidity/.test(text)) return 'route-unavailable';
  return 'unknown';
}

export function assertSwapEstimateIntegrity(
  estimate: SwapEstimateIntegrity,
  expected: {
    account: string;
    amountIn: string;
    tokenIn: SwapTokenSymbol;
    tokenOut: SwapTokenSymbol;
  },
) {
  const normalizedAmount = normalizeSwapAmount(expected.amountIn);
  if (!normalizedAmount || normalizeSwapAmount(estimate.amountIn) !== normalizedAmount) {
    throw new Error('SWAP_ESTIMATE_AMOUNT_MISMATCH');
  }

  if (estimate.chainIn !== circleSwapChain || estimate.chainOut !== circleSwapChain) {
    throw new Error('SWAP_ESTIMATE_CHAIN_MISMATCH');
  }

  if (
    estimate.fromAddress.toLowerCase() !== expected.account.toLowerCase()
    || estimate.toAddress.toLowerCase() !== expected.account.toLowerCase()
  ) {
    throw new Error('SWAP_ESTIMATE_ACCOUNT_MISMATCH');
  }

  if (estimate.tokenIn !== expected.tokenIn || estimate.tokenOut !== expected.tokenOut) {
    throw new Error('SWAP_ESTIMATE_TOKEN_MISMATCH');
  }
}
