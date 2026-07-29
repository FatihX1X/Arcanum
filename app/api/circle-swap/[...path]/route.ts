import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const circleApiOrigin = 'https://api.circle.com';
const maximumRequestBytes = 64 * 1024;
const allowedPaths = new Set([
  'quote',
  'rates',
  'swap',
  'swap/status',
]);

type RouteContext = {
  params: Promise<{ path: string[] }>;
};

async function proxyCircleSwap(request: NextRequest, context: RouteContext) {
  const { path } = await context.params;
  const circlePath = path.join('/');
  if (!allowedPaths.has(circlePath)) {
    return Response.json({ error: 'Unsupported Circle endpoint.' }, { status: 404 });
  }

  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > maximumRequestBytes) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  const upstreamUrl = new URL(`/v1/stablecoinKits/${circlePath}`, circleApiOrigin);
  upstreamUrl.search = request.nextUrl.search;

  const headers = new Headers({ Accept: 'application/json' });
  for (const header of ['authorization', 'content-type', 'x-user-agent']) {
    const value = request.headers.get(header);
    if (value) headers.set(header, value);
  }

  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer();
  if (body && body.byteLength > maximumRequestBytes) {
    return Response.json({ error: 'Request body is too large.' }, { status: 413 });
  }

  try {
    const upstreamResponse = await fetch(upstreamUrl, {
      method: request.method,
      headers,
      body,
      cache: 'no-store',
    });
    const responseHeaders = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type': upstreamResponse.headers.get('content-type') ?? 'application/json',
    });
    const requestId = upstreamResponse.headers.get('x-request-id');
    if (requestId) responseHeaders.set('x-request-id', requestId);

    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { error: 'Circle swap service is temporarily unavailable.' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyCircleSwap(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyCircleSwap(request, context);
}
