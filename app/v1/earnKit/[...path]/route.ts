import type { NextRequest } from 'next/server';
import { earnProxyPathAllowed } from '../../../../lib/circleEarn';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
const requestWindows = new Map<string, { at: number; count: number }>();

async function proxy(request: NextRequest, context: Context) {
  const path = (await context.params).path.join('/');
  if (!earnProxyPathAllowed(request.method, path)) return Response.json({ error: 'Unsupported Earn endpoint.' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return Response.json({ error: 'Origin not allowed.' }, { status: 403 });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'local';
  const now = Date.now();
  for (const [key, entry] of requestWindows) if (now - entry.at >= 60_000) requestWindows.delete(key);
  const window = requestWindows.get(ip) ?? { at: now, count: 0 };
  if (window.count >= 180 || (!requestWindows.has(ip) && requestWindows.size >= 2000)) return Response.json({ error: 'Rate limit reached.' }, { status: 429, headers: { 'Retry-After': '60' } });
  window.count++; requestWindows.set(ip, window);
  if (Number(request.headers.get('content-length') ?? 0) > 64 * 1024) return Response.json({ error: 'Request too large.' }, { status: 413 });
  const body = request.method === 'POST' ? await request.arrayBuffer() : undefined;
  if (body && body.byteLength > 64 * 1024) return Response.json({ error: 'Request too large.' }, { status: 413 });
  if (body) {
    try {
      const parsed = JSON.parse(new TextDecoder().decode(body));
      if (!parsed || typeof parsed !== 'object' || !['ARC', 'Arc'].includes(parsed.chain)) return Response.json({ error: 'Only Arc mainnet is supported.' }, { status: 400 });
    } catch { return Response.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  } else if (!request.nextUrl.searchParams.getAll('chain').length || request.nextUrl.searchParams.getAll('chain').some(chain => !['ARC', 'Arc'].includes(chain))) {
    return Response.json({ error: 'Only Arc mainnet is supported.' }, { status: 400 });
  }
  const url = new URL(`/v1/earnKit/${path}`, 'https://api.circle.com');
  url.search = request.nextUrl.search;
  const headers = new Headers({ Accept: 'application/json', 'Content-Type': 'application/json' });
  if (process.env.CIRCLE_EARN_API_KEY) headers.set('Authorization', `Bearer ${process.env.CIRCLE_EARN_API_KEY}`);
  try {
    const response = await fetch(url, { method: request.method, headers, body, cache: 'no-store', signal: AbortSignal.timeout(25_000) });
    return new Response(response.body, { status: response.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Earn service unavailable.' }, { status: 502 });
  }
}

export const GET = proxy;
export const POST = proxy;
