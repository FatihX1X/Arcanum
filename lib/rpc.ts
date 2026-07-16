type RpcErrorLike = {
  cause?: unknown;
  details?: unknown;
  message?: unknown;
  shortMessage?: unknown;
};

type RpcRetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  sleep?: (delayMs: number) => Promise<void>;
};

const transientRpcPattern = /request limit reached|rate limit|too many requests|\b429\b|temporarily unavailable|gateway timeout|network error|failed to fetch/i;

function errorParts(error: unknown, seen = new Set<unknown>()): string[] {
  if (error == null || seen.has(error)) return [];
  if (typeof error === 'string') return [error];
  if (typeof error !== 'object') return [String(error)];

  seen.add(error);
  const value = error as RpcErrorLike;
  return [value.shortMessage, value.details, value.message]
    .filter((part): part is string => typeof part === 'string' && Boolean(part.trim()))
    .concat(errorParts(value.cause, seen));
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}

export function isTransientRpcError(error: unknown) {
  return errorParts(error).some((part) => transientRpcPattern.test(part));
}

export async function withRpcRetry<T>(operation: () => Promise<T>, options: RpcRetryOptions = {}): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !isTransientRpcError(error)) throw error;
      await sleep(baseDelayMs * (2 ** attempt));
    }
  }
}

export function readableRpcError(error: unknown, fallback: string, rateLimited: string) {
  if (isTransientRpcError(error)) return rateLimited;

  const parts = errorParts(error);
  const shortMessage = parts.find((part) => part.length <= 240 && !part.includes('Request Arguments:'));
  return shortMessage?.trim() || fallback;
}
