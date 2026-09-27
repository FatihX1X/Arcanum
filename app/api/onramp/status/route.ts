import { onrampConfig } from '../../../../lib/onrampAuth';

export const dynamic = 'force-dynamic';
export function GET() {
  return Response.json({ configured: Boolean(onrampConfig()), chainId: 5042 }, { headers: { 'Cache-Control': 'no-store' } });
}
