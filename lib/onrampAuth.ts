import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { getAddress, isAddress, verifyMessage, type Address, type Hex } from 'viem';

export const proofLifetimeMs = 5 * 60 * 1000;
export const onrampCookie = '__Host-arcanum-onramp';

export async function readSmallJson(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new Error('Body too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

export function onrampConfig() {
  const apiKey = process.env.CIRCLE_API_KEY?.trim();
  const secret = process.env.ONRAMP_AUTH_SECRET;
  const origin = process.env.ONRAMP_ORIGIN;
  if (!apiKey || !secret || secret.length < 32 || !origin) return null;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== 'https:' || parsed.origin !== origin || parsed.username || parsed.password) return null;
    return { apiKey, secret, origin, referrerDomain: parsed.hostname };
  } catch { return null; }
}

type Challenge = { address: Address; origin: string; nonce: string; issuedAt: number; expiresAt: number };
function mac(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}

export function proofMessage(challenge: Challenge) {
  return `${new URL(challenge.origin).hostname} requests access to Circle Onramp for:\n${challenge.address}\n\nCreate an Onramp session for this wallet. This does not authorize a payment or blockchain transaction.\n\nURI: ${challenge.origin}\nChain ID: 5042\nNonce: ${challenge.nonce}\nIssued At: ${new Date(challenge.issuedAt).toISOString()}\nExpiration Time: ${new Date(challenge.expiresAt).toISOString()}`;
}

export function createChallenge(address: string, origin: string, secret: string, now = Date.now()) {
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) throw new Error('Invalid wallet');
  const challenge: Challenge = { address: getAddress(address), origin, nonce: randomBytes(24).toString('hex'), issuedAt: now, expiresAt: now + proofLifetimeMs };
  const payload = Buffer.from(JSON.stringify(challenge)).toString('base64url');
  return { token: `${payload}.${mac(payload, secret)}`, message: proofMessage(challenge) };
}

export async function verifyProof(token: string, signature: string, origin: string, secret: string, now = Date.now()) {
  try {
    if (token.length > 2048 || !/^0x[0-9a-f]+$/i.test(signature) || signature.length > 1024) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, supplied] = parts;
    const expected = mac(payload, secret);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return null;
    const data: Challenge = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (data.origin !== origin || !isAddress(data.address) || !Number.isSafeInteger(data.issuedAt) || !Number.isSafeInteger(data.expiresAt)) return null;
    if (data.issuedAt > now || data.expiresAt <= now || data.expiresAt - data.issuedAt !== proofLifetimeMs) return null;
    return await verifyMessage({ address: data.address, message: proofMessage(data), signature: signature as Hex }) ? data.address : null;
  } catch { return null; }
}

export function circleSessionInput(address: Address) {
  return { appUserId: `arc:5042:${address.toLowerCase()}`, destinationAddress: address, assets: { tokens: ['USDC', 'EURC'], chains: ['arc'] } };
}
