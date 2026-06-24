const storagePrefix = 'arcanum.encryptionKey.';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type StoredKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

type EncryptedPayload = {
  version: 1;
  alg: 'ECDH-P256-AES-GCM';
  iv: string;
  data: string;
  senderPublicKey: string;
};

function storageKey(address: string) {
  return `${storagePrefix}${address.toLowerCase()}`;
}

function encodeBase64Url(value: ArrayBuffer | Uint8Array | string) {
  const bytes = typeof value === 'string' ? textEncoder.encode(value) : value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function importPublicKey(publicKey: string) {
  const jwk = JSON.parse(textDecoder.decode(decodeBase64Url(publicKey))) as JsonWebKey;
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

async function importPrivateKey(jwk: JsonWebKey) {
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveKey']);
}

async function deriveAesKey(privateKey: CryptoKey, publicKey: CryptoKey) {
  return crypto.subtle.deriveKey(
    { name: 'ECDH', public: publicKey },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function ensureEncryptionKeyPair(address: string) {
  const existing = localStorage.getItem(storageKey(address));

  if (existing) {
    const parsed = JSON.parse(existing) as StoredKeyPair;
    return {
      publicKey: encodeBase64Url(JSON.stringify(parsed.publicKey)),
      privateKey: parsed.privateKey,
    };
  }

  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );

  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const stored: StoredKeyPair = { publicKey, privateKey };

  localStorage.setItem(storageKey(address), JSON.stringify(stored));

  return {
    publicKey: encodeBase64Url(JSON.stringify(publicKey)),
    privateKey,
  };
}

export async function encryptMessage(message: string, recipientPublicKey: string, senderAddress: string) {
  const senderKeys = await ensureEncryptionKeyPair(senderAddress);
  const senderPrivateKey = await importPrivateKey(senderKeys.privateKey);
  const recipientKey = await importPublicKey(recipientPublicKey);
  const aesKey = await deriveAesKey(senderPrivateKey, recipientKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, textEncoder.encode(message));
  const payload: EncryptedPayload = {
    version: 1,
    alg: 'ECDH-P256-AES-GCM',
    iv: encodeBase64Url(iv),
    data: encodeBase64Url(encrypted),
    senderPublicKey: senderKeys.publicKey,
  };

  return JSON.stringify(payload);
}

export async function decryptMessage(payload: string, recipientAddress: string) {
  const recipientKeys = await ensureEncryptionKeyPair(recipientAddress);
  const parsed = JSON.parse(payload) as EncryptedPayload;
  const recipientPrivateKey = await importPrivateKey(recipientKeys.privateKey);
  const senderPublicKey = await importPublicKey(parsed.senderPublicKey);
  const aesKey = await deriveAesKey(recipientPrivateKey, senderPublicKey);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(parsed.iv) },
    aesKey,
    decodeBase64Url(parsed.data),
  );

  return textDecoder.decode(decrypted);
}
