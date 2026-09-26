import { NextRequest, NextResponse } from 'next/server';
import { circleSessionInput, onrampConfig, onrampCookie, readSmallJson, verifyProof } from '../../../../lib/onrampAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const config = onrampConfig();
  const headers = { 'Cache-Control': 'no-store' };
  if (!config) return NextResponse.json({ error: 'ONRAMP_UNAVAILABLE' }, { status: 503, headers });
  if (request.headers.get('origin') !== config.origin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers });
  const token = request.cookies.get(onrampCookie)?.value;
  if (!token) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
  let signature: string;
  try {
    const body = await readSmallJson(request, 2048);
    if (typeof body.signature !== 'string' || Object.keys(body).some(key => key !== 'signature')) throw new Error('Invalid body');
    signature = body.signature;
  } catch { return NextResponse.json({ error: 'INVALID_REQUEST' }, { status: 400, headers }); }
  const address = await verifyProof(token, signature, config.origin, config.secret);
  if (!address) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401, headers });
  try {
    const { createAppServerKit } = await import('@circle-fin/app-kit/server');
    const kit = createAppServerKit({ onramp: { apiKey: config.apiKey, referrerDomain: config.referrerDomain, baseUrl: 'https://api.circle.com', widgetBaseUrl: 'https://onramp.arc.io' } });
    const session = await kit.onramp.createSession(circleSessionInput(address));
    const response = NextResponse.json(session, { headers });
    response.cookies.set(onrampCookie, '', { secure: true, httpOnly: true, sameSite: 'strict', path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    const type = error && typeof error === 'object' && 'type' in error ? error.type : undefined;
    const status = type === 'RATE_LIMIT' ? 429 : type === 'NETWORK' ? 504 : 502;
    return NextResponse.json({ error: 'SESSION_CREATION_FAILED' }, { status, headers });
  }
}
