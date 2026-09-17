import { NextRequest } from 'next/server';

import { bridgeChainById } from '@/lib/bridgeChains';
import { arcNetwork } from '@/lib/chain';
import { isSafeJsonRpcPayload, rpcProxyBodyLimit } from '@/lib/rpcProxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function rpcUrlFor(chainId: number) {
  if (chainId === arcNetwork.id) return arcNetwork.rpcUrls.default.http[0];
  return bridgeChainById.get(chainId)?.rpcEndpoints[0];
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chainId: string }> },
) {
  const { chainId: rawChainId } = await context.params;
  if (!/^\d+$/.test(rawChainId)) {
    return Response.json({ error: 'Invalid chain ID.' }, { status: 400 });
  }

  const rpcUrl = rpcUrlFor(Number(rawChainId));
  if (!rpcUrl) {
    return Response.json({ error: 'Unsupported chain.' }, { status: 404 });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > rpcProxyBodyLimit) {
    return Response.json({ error: 'RPC request is too large.' }, { status: 413 });
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > rpcProxyBodyLimit) {
    return Response.json({ error: 'RPC request is too large.' }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Invalid JSON-RPC body.' }, { status: 400 });
  }
  if (!isSafeJsonRpcPayload(payload)) {
    return Response.json({ error: 'Unsupported JSON-RPC request.' }, { status: 400 });
  }

  try {
    const upstream = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      cache: 'no-store',
      signal: AbortSignal.timeout(20_000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-store',
      },
    });
  } catch {
    return Response.json({ error: 'RPC upstream unavailable.' }, { status: 502 });
  }
}
