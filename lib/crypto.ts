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

type EncryptedKeyBackup = {
  version: 1;
  app: 'arcanum';
  alg: 'PBKDF2-SHA256-AES-GCM';
  address: string;
  publicKey: string;
  createdAt: string;
  kdf: {
    iterations: number;
    salt: string;
  };
  iv: string;
  data: string;
};

const backupKdfIterations = 250000;

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

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
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

async function deriveBackupKey(passphrase: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations: backupKdfIterations,
    },
    keyMaterial,
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

export function hasStoredEncryptionKey(address: string) {
  return Boolean(localStorage.getItem(storageKey(address)));
}

export async function exportEncryptionKey(address: string, passphrase: string) {
  const existing = localStorage.getItem(storageKey(address));

  if (!existing) {
    throw new Error('NO_LOCAL_KEY');
  }

  if (!passphrase) {
    throw new Error('PASSPHRASE_REQUIRED');
  }

  const parsed = JSON.parse(existing) as StoredKeyPair;
  const publicKey = encodeBase64Url(JSON.stringify(parsed.publicKey));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const backupKey = await deriveBackupKey(passphrase, salt);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, backupKey, textEncoder.encode(existing));
  const backup: EncryptedKeyBackup = {
    version: 1,
    app: 'arcanum',
    alg: 'PBKDF2-SHA256-AES-GCM',
    address: address.toLowerCase(),
    publicKey,
    createdAt: new Date().toISOString(),
    kdf: {
      iterations: backupKdfIterations,
      salt: encodeBase64Url(salt),
    },
    iv: encodeBase64Url(iv),
    data: encodeBase64Url(encrypted),
  };

  return JSON.stringify(backup, null, 2);
}

export async function importEncryptionKey(address: string, backupJson: string, passphrase: string) {
  if (!passphrase) {
    throw new Error('PASSPHRASE_REQUIRED');
  }

  const backup = JSON.parse(backupJson) as EncryptedKeyBackup;

  if (backup.version !== 1 || backup.app !== 'arcanum' || backup.alg !== 'PBKDF2-SHA256-AES-GCM') {
    throw new Error('INVALID_KEY_BACKUP');
  }

  const salt = decodeBase64Url(backup.kdf.salt);
  const backupKey = await deriveBackupKey(passphrase, salt);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(backup.iv) },
    backupKey,
    decodeBase64Url(backup.data),
  );
  const stored = JSON.parse(textDecoder.decode(decrypted)) as StoredKeyPair;
  const publicKey = encodeBase64Url(JSON.stringify(stored.publicKey));

  localStorage.setItem(storageKey(address), JSON.stringify(stored));

  return {
    publicKey,
    backupPublicKey: backup.publicKey,
    matchesBackup: publicKey === backup.publicKey,
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
