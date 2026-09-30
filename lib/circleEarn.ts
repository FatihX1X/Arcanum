import { formatUnits, parseUnits } from 'viem';

export const earnChain = 'Arc' as const;
export const earnChainId = 5042;
export const earnQuoteTtl = 30_000;
export type EarnAction = 'deposit' | 'withdraw' | 'claim';
type Provider = { request(args: { method: string; params?: unknown }): Promise<unknown> };

export async function createEarnScopedProvider(provider: Provider, account: string, isCurrent: () => boolean, onSubmitted?: (hash: `0x${string}`) => void): Promise<Provider> {
  const check = async () => {
    const [accounts, chain] = await Promise.all([provider.request({ method: 'eth_accounts' }), provider.request({ method: 'eth_chainId' })]);
    if (!isCurrent() || !Array.isArray(accounts) || typeof accounts[0] !== 'string' || accounts[0].toLowerCase() !== account.toLowerCase() || Number(chain) !== earnChainId) throw new Error('Wallet account or chain changed');
  };
  await check();
  return {
    async request(args) {
      if (/sendTransaction|sign|sendCalls/i.test(args.method)) await check();
      const result = await provider.request(args);
      if (args.method === 'eth_sendTransaction' && typeof result === 'string' && /^0x[a-fA-F0-9]{64}$/.test(result)) {
        const tx = Array.isArray(args.params) ? args.params[0] as { data?: string } : undefined;
        if (tx?.data && !tx.data.startsWith('0x095ea7b3')) onSubmitted?.(result as `0x${string}`);
      }
      if (args.method === 'eth_accounts' || args.method === 'eth_requestAccounts') {
        if (!Array.isArray(result) || !result.some(a => typeof a === 'string' && a.toLowerCase() === account.toLowerCase())) throw new Error('Wallet account changed');
        return [account];
      }
      return result;
    },
  };
}

export function parseEarnAmount(input: string): bigint | null {
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input)) return null;
  const amount = parseUnits(input, 6);
  return amount > 0n ? amount : null;
}

export function earnUnits(input: string | undefined): bigint {
  if (!input || !/^\d+(\.\d+)?$/.test(input)) return 0n;
  const [whole, fraction = ''] = input.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, '0'));
}

export function earnMaximum(action: EarnAction, balance: bigint, liquidity: bigint, reserve: bigint, asset: string) {
  if (action === 'withdraw') return balance < liquidity ? balance : liquidity;
  if (asset !== 'USDC') return balance;
  return balance > reserve ? balance - reserve : 0n;
}

export function earnQuoteMatches(quote: { key: string; at: number } | null, key: string, now = Date.now()) {
  return Boolean(quote && quote.key === key && now >= quote.at && now - quote.at < earnQuoteTtl);
}

export function earnError(error: unknown, tr: boolean) {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancel|4001/i.test(message)) return tr ? 'Cüzdan onayı iptal edildi.' : 'Wallet approval was cancelled.';
  if (/429|rate.?limit/i.test(message)) return tr ? 'Sorgu sınırına ulaşıldı. Biraz sonra tekrar deneyin.' : 'Rate limit reached. Try again shortly.';
  if (/chain|network|account.*changed/i.test(message)) return tr ? 'Cüzdan hesabınızı ve Arc mainnet ağını kontrol edin.' : 'Check your wallet account and switch to Arc mainnet.';
  if (/insufficient|not.*enough|liquidity/i.test(message)) return tr ? 'Kullanılabilir bakiye, gas veya çekim likiditesi yetersiz.' : 'Insufficient balance, gas or withdrawal liquidity.';
  if (/quote.*expired|quote.*mismatch/i.test(message)) return tr ? 'Önizleme geçersiz. Yeni önizleme isteyin.' : 'Preview is invalid. Request a new preview.';
  return tr ? 'Earn işlemi tamamlanamadı. Servis veya işlem bu ağda kullanılamıyor olabilir. Yeniden deneyin.' : 'Earn could not complete this step. The service or operation may be unavailable on this network. Try again.';
}

export function formatEarnAmount(amount: bigint) { return formatUnits(amount, 6); }

export function earnGasReserve(estimates: readonly { fees: { fee: string } | null }[] | undefined, fallback: bigint) {
  const wei = (estimates ?? []).reduce((sum, item) => sum + (item.fees && /^\d+$/.test(item.fees.fee) ? BigInt(item.fees.fee) : 0n), 0n);
  const buffered = (wei * 12n + 10n * 1_000_000_000_000n - 1n) / (10n * 1_000_000_000_000n);
  return buffered > fallback ? buffered : fallback;
}

export function assertEarnQuote(quote: { vaultAddress?: string; deposit?: { amount: string; symbol: string }; withdrawal?: { amount: string; symbol: string } }, vault: { vaultAddress: string; asset: string }, amount: string) {
  if (quote.vaultAddress && quote.vaultAddress.toLowerCase() !== vault.vaultAddress.toLowerCase()) throw new Error('Quote vault mismatch');
  const value = quote.deposit ?? quote.withdrawal;
  if (value && (earnUnits(value.amount) !== parseEarnAmount(amount) || value.symbol !== vault.asset)) throw new Error('Quote amount or asset mismatch');
}

export function earnProxyPathAllowed(method: string, path: string) {
  if (method === 'GET') return ['vaults', 'vaults/explore'].includes(path) || /^position\/0x[a-fA-F0-9]{40}$/.test(path);
  return method === 'POST' && ['deposit', 'withdraw', 'claimRewards', 'deposit/quote', 'withdrawal/quote', 'claimRewards/quote', 'transactions/report'].includes(path);
}
