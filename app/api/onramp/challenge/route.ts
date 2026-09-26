import { NextRequest, NextResponse } from 'next/server';
import { createChallenge, onrampConfig, onrampCookie, readSmallJson } from '../../../../lib/onrampAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  const config = onrampConfig();
  const headers = { 'Cache-Control': 'no-store' };
  if (!config) return NextResponse.json({ error: 'ONRAMP_UNAVAILABLE' }, { status: 503, headers });
  if (request.headers.get('origin') !== config.origin) return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers });
  try {
    const { address } = await readSmallJson(request, 256);
    if (typeof address !== 'string') throw new Error('Missing wallet');
    const { token, message } = createChallenge(address, config.origin, config.secret);
    const response = NextResponse.json({ message }, { headers });
    response.cookies.set(onrampCookie, token, { secure: true, httpOnly: true, sameSite: 'strict', path: '/', maxAge: 300 });
    return response;
  } catch { return NextResponse.json({ error: 'INVALID_WALLET' }, { status: 400, headers }); }
}
