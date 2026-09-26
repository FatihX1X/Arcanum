import { isAddress } from 'viem';

import { netArcSwapTransfers } from '@/lib/history';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const arcExplorerApi = 'https://explorer.arc.io/api/v2';
const maximumPagesPerRequest = 3;

type ArcScanResponse = {
  items?: Parameters<typeof netArcSwapTransfers>[0];
  next_page_params?: Record<string, string | number> | null;
};

function encodeCursor(value: Record<string, string | number> | null | undefined) {
  return value ? Buffer.from(JSON.stringify(value)).toString('base64url') : null;
}

function decodeCursor(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, string | number> : null;
  } catch {
    throw new Error('INVALID_CURSOR');
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get('address') ?? '';
  if (!isAddress(address)) {
    return Response.json({ error: 'A valid wallet address is required.' }, { status: 400 });
  }

  let cursor: Record<string, string | number> | null;
  try {
    cursor = decodeCursor(searchParams.get('cursor'));
  } catch {
    return Response.json({ error: 'Invalid history cursor.' }, { status: 400 });
  }

  const transfers: NonNullable<ArcScanResponse['items']> = [];
  let nextCursor = cursor;
  try {
    for (let page = 0; page < maximumPagesPerRequest; page += 1) {
      const url = new URL(`${arcExplorerApi}/addresses/${address}/token-transfers`);
      url.searchParams.set('type', 'ERC-20');
      for (const [key, value] of Object.entries(nextCursor ?? {})) {
        url.searchParams.set(key, String(value));
      }
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) throw new Error(`Arc Explorer returned ${response.status}`);
      const payload = await response.json() as ArcScanResponse;
      transfers.push(...(payload.items ?? []));
      nextCursor = payload.next_page_params ?? null;
      if (!nextCursor || netArcSwapTransfers(transfers, address).length >= 12) break;
    }

    return Response.json(
      { items: netArcSwapTransfers(transfers, address).slice(0, 12), nextCursor: encodeCursor(nextCursor) },
      { headers: { 'Cache-Control': 'private, max-age=15' } },
    );
  } catch {
    return Response.json(
      { error: 'Arc Explorer history is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
