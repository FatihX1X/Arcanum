import type { EstimateResult } from '@circle-fin/bridge-kit';

import {
  arcBridgeChain,
  bridgeChainByKey,
  isSupportedArcBridgeRoute,
  type BridgeChainKey,
  type BridgeEvmTestnet,
} from './bridgeChains';
import {
  formatSwapUnits,
  normalizeSwapAmount,
  parseSwapAmount,
} from './circleSwap';

export const bridgeEstimateDebounceMs = 500;
export const bridgeEstimateTtlMs = 30_000;
export const bridgeGasBufferBps = 12_000n;
export const fallbackArcBridgeGasReserve = 100_000n;

export type BridgeErrorKind =
  | 'rejected'
  | 'wrong-source-chain'
  | 'wallet-provider'
  | 'unsupported-route'
  | 'insufficient-usdc'
  | 'insufficient-gas'
  | 'quote-expired'
  | 'rate-limited'
  | 'forwarder'
  | 'partial'
  | 'service-unavailable'
  | 'unknown';

function errorText(error: unknown, seen = new Set<unknown>()): string {
  if (error == null || seen.has(error)) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  seen.add(error);
  const value = error as {
    cause?: unknown;
    code?: unknown;
    details?: unknown;
    message?: unknown;
    shortMessage?: unknown;
  };
  return [
    value.code,
    value.shortMessage,
    value.details,
    value.message,
    errorText(value.cause, seen),
  ].filter(Boolean).join(' ');
}

export function bridgeErrorKind(error: unknown): BridgeErrorKind {
  const text = errorText(error).toLowerCase();
  if (/reject|denied|declined|cancelled|canceled|4001|user_rejected/.test(text)) return 'rejected';
  if (/network mismatch|wrong.*chain|chain.*mismatch|switch.*chain/.test(text)) return 'wrong-source-chain';
  if (/wallet.*unavailable|provider.*unavailable|account mismatch|wallet_account_mismatch/.test(text)) return 'wallet-provider';
  if (/unsupported.*route|no provider|route.*support|cctp.*support/.test(text)) return 'unsupported-route';
  if (/insufficient.*usdc|exceeds.*balance|token.*balance/.test(text)) return 'insufficient-usdc';
  if (/insufficient.*gas|funds for gas|native.*balance/.test(text)) return 'insufficient-gas';
  if (/expired|stale.*estimate|quote.*invalid/.test(text)) return 'quote-expired';
  if (/rate limit|too many requests|\b429\b|request limit reached/.test(text)) return 'rate-limited';
  if (/forwarder|forwarding|attestation|iris/.test(text)) return 'forwarder';
  if (/partial|burn.*success.*mint.*fail|pending.*mint/.test(text)) return 'partial';
  if (/failed to fetch|network error|service unavailable|temporarily unavailable|\b5\d\d\b/.test(text)) return 'service-unavailable';
  return 'unknown';
}

export function isFreshBridgeEstimate(estimatedAt: number, now = Date.now()) {
  return estimatedAt > 0 && now >= estimatedAt && now - estimatedAt < bridgeEstimateTtlMs;
}

export function bufferedBridgeGas(value: bigint) {
  return (value * bridgeGasBufferBps + 9_999n) / 10_000n;
}

export function arcNativeGasWeiToTokenUnits(value: bigint) {
  return (value + 999_999_999_999n) / 1_000_000_000_000n;
}

export function arcBridgeMaxBalance(
  tokenBalance: bigint,
  estimatedGasReserve = fallbackArcBridgeGasReserve,
) {
  const reserve = bufferedBridgeGas(estimatedGasReserve);
  return tokenBalance > reserve ? tokenBalance - reserve : 0n;
}

export function bridgeFeeTotal(fees: EstimateResult['fees']) {
  return fees.reduce((total, fee) => {
    const amount = fee.amount ? parseSwapAmount(fee.amount) : null;
    return total + (amount ?? 0n);
  }, 0n);
}

export function formatBridgeFeeTotal(fees: EstimateResult['fees']) {
  return formatSwapUnits(bridgeFeeTotal(fees));
}

export function assertBridgeEstimateIntegrity(
  estimate: EstimateResult,
  expected: {
    account: string;
    amount: string;
    source: BridgeEvmTestnet;
    destination: BridgeEvmTestnet;
  },
) {
  const normalized = normalizeSwapAmount(expected.amount);
  if (!normalized || normalizeSwapAmount(estimate.amount) !== normalized) {
    throw new Error('BRIDGE_ESTIMATE_AMOUNT_MISMATCH');
  }
  if (estimate.token !== 'USDC') throw new Error('BRIDGE_ESTIMATE_TOKEN_MISMATCH');
  if (
    estimate.source.chain !== expected.source.chain
    || estimate.destination.chain !== expected.destination.chain
  ) {
    throw new Error('BRIDGE_ESTIMATE_CHAIN_MISMATCH');
  }
  if (
    estimate.source.address.toLowerCase() !== expected.account.toLowerCase()
    || (
      estimate.destination.recipientAddress
        ? estimate.destination.recipientAddress.toLowerCase() !== expected.account.toLowerCase()
        : estimate.destination.address.toLowerCase() !== expected.account.toLowerCase()
    )
  ) {
    throw new Error('BRIDGE_ESTIMATE_ACCOUNT_MISMATCH');
  }
  if (!isSupportedArcBridgeRoute(expected.source, expected.destination)) {
    throw new Error('BRIDGE_UNSUPPORTED_ROUTE');
  }
}

export function chainPairFromKeys(source: BridgeChainKey, destination: BridgeChainKey) {
  const sourceChain = bridgeChainByKey.get(source);
  const destinationChain = bridgeChainByKey.get(destination);
  if (!sourceChain || !destinationChain) throw new Error('BRIDGE_UNSUPPORTED_CHAIN');
  return { source: sourceChain, destination: destinationChain };
}

export function isArcBridgeSource(chain: BridgeEvmTestnet) {
  return chain.chain === arcBridgeChain.chain;
}
