const storagePrefix = 'arcanum.encryptionKey.';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

type StoredKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

type EncryptedCopy = {
  iv: string;
  data: string;
};

type EncryptedPayloadV1 = {
  version: 1;
  alg: 'ECDH-P256-AES-GCM';
  iv: string;
  data: string;
  senderPublicKey: string;
};

type EncryptedPayloadV2 = {
  version: 2;
  alg: 'ECDH-P256-AES-GCM';
  senderPublicKey: string;
  recipientPublicKey: string;
  recipient: EncryptedCopy;
  sender: EncryptedCopy;
};

type EncryptedPayload = EncryptedPayloadV1 | EncryptedPayloadV2;

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

async function encryptCopy(message: string, aesKey: CryptoKey): Promise<EncryptedCopy> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, textEncoder.encode(message));

  return {
    iv: encodeBase64Url(iv),
    data: encodeBase64Url(encrypted),
  };
}

async function decryptCopy(copy: EncryptedCopy, aesKey: CryptoKey) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(copy.iv) },
    aesKey,
    decodeBase64Url(copy.data),
  );

  return textDecoder.decode(decrypted);
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
  const senderKey = await importPublicKey(senderKeys.publicKey);
  const recipientAesKey = await deriveAesKey(senderPrivateKey, recipientKey);
  const senderAesKey = await deriveAesKey(senderPrivateKey, senderKey);

  const payload: EncryptedPayloadV2 = {
    version: 2,
    alg: 'ECDH-P256-AES-GCM',
    senderPublicKey: senderKeys.publicKey,
    recipientPublicKey,
    recipient: await encryptCopy(message, recipientAesKey),
    sender: await encryptCopy(message, senderAesKey),
  };

  return JSON.stringify(payload);
}

export async function decryptMessage(payload: string, viewerAddress: string) {
  const viewerKeys = await ensureEncryptionKeyPair(viewerAddress);
  const parsed = JSON.parse(payload) as EncryptedPayload;
  const viewerPrivateKey = await importPrivateKey(viewerKeys.privateKey);

  if (parsed.version === 1) {
    const senderPublicKey = await importPublicKey(parsed.senderPublicKey);
    const aesKey = await deriveAesKey(viewerPrivateKey, senderPublicKey);
    return decryptCopy({ iv: parsed.iv, data: parsed.data }, aesKey);
  }

  if (parsed.version !== 2) {
    throw new Error('Unsupported private payload version.');
  }

  const senderPublicKey = await importPublicKey(parsed.senderPublicKey);
  const aesKey = await deriveAesKey(viewerPrivateKey, senderPublicKey);
  const preferredCopy = viewerKeys.publicKey === parsed.senderPublicKey ? parsed.sender : parsed.recipient;

  try {
    return await decryptCopy(preferredCopy, aesKey);
  } catch (error) {
    const fallbackCopy = preferredCopy === parsed.sender ? parsed.recipient : parsed.sender;
    return decryptCopy(fallbackCopy, aesKey);
  }
}
