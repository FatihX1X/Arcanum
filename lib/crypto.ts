const storagePrefix = 'arcanum.encryptionKey.';
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const localKdfIterations = 250000;
const backupKdfIterations = 250000;
const sessionKeys = new Map<string, StoredKeyPair>();

type StoredKeyPair = {
  publicKey: JsonWebKey;
  privateKey: JsonWebKey;
};

type EncryptedLocalKey = {
  version: 2;
  app: 'arcanum';
  type: 'local-key';
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

type EncryptedPayloadV3 = {
  version: 3;
  alg: 'ECDH-P256-HKDF-SHA256-AES-GCM';
  meta: {
    chainId: number;
    contractAddress: string;
    sender: string;
    recipient: string;
    senderPublicKey: string;
    recipientPublicKey: string;
    senderKeyId: string;
    recipientKeyId: string;
  };
  recipient: EncryptedCopy;
  sender: EncryptedCopy;
};

type EncryptedPayload = EncryptedPayloadV1 | EncryptedPayloadV2 | EncryptedPayloadV3;

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

export type MessageCryptoContext = {
  chainId: number;
  contractAddress: string;
  senderAddress: string;
  recipientAddress: string;
};

export type PrivatePayloadContext = MessageCryptoContext & {
  senderPublicKey?: string;
  recipientPublicKey?: string;
};

function storageKey(address: string) {
  return `${storagePrefix}${address.toLowerCase()}`;
}

function normalizeAddress(address: string) {
  return address.toLowerCase();
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

function publicKeyString(jwk: JsonWebKey) {
  return encodeBase64Url(JSON.stringify(jwk));
}

async function sha256Base64Url(value: string) {
  return encodeBase64Url(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

async function importPublicKey(publicKey: string) {
  const jwk = JSON.parse(textDecoder.decode(decodeBase64Url(publicKey))) as JsonWebKey;
  return crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, []);
}

async function importPrivateKey(jwk: JsonWebKey) {
  const normalizedJwk: JsonWebKey = { ...jwk, key_ops: ['deriveBits'] };
  return crypto.subtle.importKey('jwk', normalizedJwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
}

async function deriveLegacyAesKey(privateKey: CryptoKey, publicKey: CryptoKey) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function deriveV3AesKey(privateKey: CryptoKey, publicKey: CryptoKey, aad: string) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const keyMaterial = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const salt = await crypto.subtle.digest('SHA-256', textEncoder.encode(`arcanum:v3:salt:${aad}`));

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: textEncoder.encode(`arcanum:v3:message:${aad}`),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function derivePasswordKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const keyMaterial = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: toArrayBuffer(salt),
      iterations,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function encryptCopy(message: string, aesKey: CryptoKey, aad?: string): Promise<EncryptedCopy> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad ? textEncoder.encode(aad) : undefined },
    aesKey,
    textEncoder.encode(message),
  );

  return {
    iv: encodeBase64Url(iv),
    data: encodeBase64Url(encrypted),
  };
}

async function decryptCopy(copy: EncryptedCopy, aesKey: CryptoKey, aad?: string) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(copy.iv), additionalData: aad ? textEncoder.encode(aad) : undefined },
    aesKey,
    decodeBase64Url(copy.data),
  );

  return textDecoder.decode(decrypted);
}

function isEncryptedLocalKey(value: unknown): value is EncryptedLocalKey {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as EncryptedLocalKey).version === 2 &&
    (value as EncryptedLocalKey).app === 'arcanum' &&
    (value as EncryptedLocalKey).type === 'local-key'
  );
}

function isEncryptedCopy(value: unknown): value is EncryptedCopy {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as EncryptedCopy).iv === 'string' &&
    typeof (value as EncryptedCopy).data === 'string' &&
    (value as EncryptedCopy).iv.length > 0 &&
    (value as EncryptedCopy).data.length > 0
  );
}

function isLegacyStoredKeyPair(value: unknown): value is StoredKeyPair {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    typeof (value as StoredKeyPair).publicKey === 'object' &&
    typeof (value as StoredKeyPair).privateKey === 'object'
  );
}

async function encryptStoredKeyPair(address: string, stored: StoredKeyPair, passphrase: string) {
  const publicKey = publicKeyString(stored.publicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const localKey = await derivePasswordKey(passphrase, salt, localKdfIterations);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, localKey, textEncoder.encode(JSON.stringify(stored)));

  const encryptedLocalKey: EncryptedLocalKey = {
    version: 2,
    app: 'arcanum',
    type: 'local-key',
    alg: 'PBKDF2-SHA256-AES-GCM',
    address: normalizeAddress(address),
    publicKey,
    createdAt: new Date().toISOString(),
    kdf: {
      iterations: localKdfIterations,
      salt: encodeBase64Url(salt),
    },
    iv: encodeBase64Url(iv),
    data: encodeBase64Url(encrypted),
  };

  localStorage.setItem(storageKey(address), JSON.stringify(encryptedLocalKey));
  sessionKeys.set(storageKey(address), stored);

  return publicKey;
}

async function decryptStoredKeyPair(record: EncryptedLocalKey, passphrase: string) {
  const salt = decodeBase64Url(record.kdf.salt);
  const localKey = await derivePasswordKey(passphrase, salt, record.kdf.iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(record.iv) },
    localKey,
    decodeBase64Url(record.data),
  );
  const stored = JSON.parse(textDecoder.decode(decrypted)) as StoredKeyPair;
  const publicKey = publicKeyString(stored.publicKey);

  if (publicKey !== record.publicKey) {
    throw new Error('LOCAL_KEY_PUBLIC_MISMATCH');
  }

  return stored;
}

async function readKeyPair(address: string, passphrase?: string, createIfMissing = false) {
  const key = storageKey(address);
  const cached = sessionKeys.get(key);

  if (cached) {
    return cached;
  }

  const existing = localStorage.getItem(key);

  if (existing) {
    const parsed = JSON.parse(existing) as EncryptedLocalKey | StoredKeyPair;

    if (isEncryptedLocalKey(parsed)) {
      if (!passphrase) {
        throw new Error('LOCAL_KEY_LOCKED');
      }
      if (parsed.address !== normalizeAddress(address)) {
        throw new Error('LOCAL_KEY_ADDRESS_MISMATCH');
      }
      const stored = await decryptStoredKeyPair(parsed, passphrase);
      sessionKeys.set(key, stored);
      return stored;
    }

    if (isLegacyStoredKeyPair(parsed)) {
      throw new Error('LOCAL_KEY_REQUIRES_MIGRATION');
    }

    throw new Error('LOCAL_KEY_INVALID_FORMAT');
  }

  if (!createIfMissing) {
    throw new Error('NO_LOCAL_KEY');
  }

  if (!passphrase) {
    throw new Error('PASSPHRASE_REQUIRED');
  }

  const keyPair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKey = await crypto.subtle.exportKey('jwk', keyPair.privateKey);
  const stored: StoredKeyPair = { publicKey, privateKey };

  await encryptStoredKeyPair(address, stored, passphrase);
  return stored;
}

function aadFor(meta: EncryptedPayloadV3['meta'], role: 'sender' | 'recipient') {
  return [
    'arcanum',
    'v3',
    String(meta.chainId),
    meta.contractAddress.toLowerCase(),
    meta.sender.toLowerCase(),
    meta.recipient.toLowerCase(),
    meta.senderKeyId,
    meta.recipientKeyId,
    role,
  ].join('|');
}

export async function ensureEncryptionKeyPair(address: string, passphrase?: string) {
  const stored = await readKeyPair(address, passphrase, true);

  return {
    publicKey: publicKeyString(stored.publicKey),
    privateKey: stored.privateKey,
  };
}

export async function unlockEncryptionKey(address: string, passphrase: string) {
  const stored = await readKeyPair(address, passphrase, false);

  return {
    publicKey: publicKeyString(stored.publicKey),
    privateKey: stored.privateKey,
  };
}

export function hasStoredEncryptionKey(address: string) {
  return Boolean(localStorage.getItem(storageKey(address)));
}

export function isEncryptionKeyUnlocked(address: string) {
  return sessionKeys.has(storageKey(address));
}

export async function exportEncryptionKey(address: string, passphrase: string) {
  if (!passphrase) {
    throw new Error('PASSPHRASE_REQUIRED');
  }

  const stored = await readKeyPair(address, passphrase, false);
  const publicKey = publicKeyString(stored.publicKey);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const backupKey = await derivePasswordKey(passphrase, salt, backupKdfIterations);
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, backupKey, textEncoder.encode(JSON.stringify(stored)));
  const backup: EncryptedKeyBackup = {
    version: 1,
    app: 'arcanum',
    alg: 'PBKDF2-SHA256-AES-GCM',
    address: normalizeAddress(address),
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

  if (backup.address !== normalizeAddress(address)) {
    throw new Error('KEY_BACKUP_ADDRESS_MISMATCH');
  }

  const salt = decodeBase64Url(backup.kdf.salt);
  const backupKey = await derivePasswordKey(passphrase, salt, backup.kdf.iterations);
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decodeBase64Url(backup.iv) },
    backupKey,
    decodeBase64Url(backup.data),
  );
  const stored = JSON.parse(textDecoder.decode(decrypted)) as StoredKeyPair;
  const publicKey = publicKeyString(stored.publicKey);

  if (publicKey !== backup.publicKey) {
    throw new Error('KEY_BACKUP_PUBLIC_MISMATCH');
  }

  await encryptStoredKeyPair(address, stored, passphrase);

  return {
    publicKey,
    backupPublicKey: backup.publicKey,
    matchesBackup: publicKey === backup.publicKey,
  };
}

export async function encryptMessage(
  message: string,
  recipientPublicKey: string,
  senderAddress: string,
  recipientAddress: string,
  context: Pick<MessageCryptoContext, 'chainId' | 'contractAddress'>,
  passphrase?: string,
) {
  const senderKeys = await ensureEncryptionKeyPair(senderAddress, passphrase);
  const senderPrivateKey = await importPrivateKey(senderKeys.privateKey);
  const recipientKey = await importPublicKey(recipientPublicKey);
  const senderKey = await importPublicKey(senderKeys.publicKey);
  const meta: EncryptedPayloadV3['meta'] = {
    chainId: context.chainId,
    contractAddress: context.contractAddress,
    sender: normalizeAddress(senderAddress),
    recipient: normalizeAddress(recipientAddress),
    senderPublicKey: senderKeys.publicKey,
    recipientPublicKey,
    senderKeyId: await sha256Base64Url(senderKeys.publicKey),
    recipientKeyId: await sha256Base64Url(recipientPublicKey),
  };

  const recipientAad = aadFor(meta, 'recipient');
  const senderAad = aadFor(meta, 'sender');
  const recipientAesKey = await deriveV3AesKey(senderPrivateKey, recipientKey, recipientAad);
  const senderAesKey = await deriveV3AesKey(senderPrivateKey, senderKey, senderAad);

  const payload: EncryptedPayloadV3 = {
    version: 3,
    alg: 'ECDH-P256-HKDF-SHA256-AES-GCM',
    meta,
    recipient: await encryptCopy(message, recipientAesKey, recipientAad),
    sender: await encryptCopy(message, senderAesKey, senderAad),
  };

  return JSON.stringify(payload);
}

export async function assertPrivatePayloadV3(payload: string, expected: PrivatePayloadContext) {
  let parsed: EncryptedPayloadV3;

  try {
    parsed = JSON.parse(payload) as EncryptedPayloadV3;
  } catch {
    throw new Error('PRIVATE_PAYLOAD_INVALID_JSON');
  }

  if (!parsed || parsed.version !== 3 || parsed.alg !== 'ECDH-P256-HKDF-SHA256-AES-GCM') {
    throw new Error('PRIVATE_PAYLOAD_NOT_V3');
  }

  if (!parsed.meta || !isEncryptedCopy(parsed.sender) || !isEncryptedCopy(parsed.recipient)) {
    throw new Error('PRIVATE_PAYLOAD_MISSING_FIELDS');
  }

  if (parsed.meta.chainId !== expected.chainId) {
    throw new Error('PRIVATE_PAYLOAD_CHAIN_MISMATCH');
  }

  if (normalizeAddress(parsed.meta.contractAddress) !== normalizeAddress(expected.contractAddress)) {
    throw new Error('PRIVATE_PAYLOAD_CONTRACT_MISMATCH');
  }

  if (normalizeAddress(parsed.meta.sender) !== normalizeAddress(expected.senderAddress)) {
    throw new Error('PRIVATE_PAYLOAD_SENDER_MISMATCH');
  }

  if (normalizeAddress(parsed.meta.recipient) !== normalizeAddress(expected.recipientAddress)) {
    throw new Error('PRIVATE_PAYLOAD_RECIPIENT_MISMATCH');
  }

  if (!parsed.meta.senderPublicKey || !parsed.meta.recipientPublicKey || !parsed.meta.senderKeyId || !parsed.meta.recipientKeyId) {
    throw new Error('PRIVATE_PAYLOAD_KEY_METADATA_MISSING');
  }

  if (expected.senderPublicKey && parsed.meta.senderPublicKey !== expected.senderPublicKey) {
    throw new Error('PRIVATE_PAYLOAD_SENDER_KEY_MISMATCH');
  }

  if (expected.recipientPublicKey && parsed.meta.recipientPublicKey !== expected.recipientPublicKey) {
    throw new Error('PRIVATE_PAYLOAD_RECIPIENT_KEY_MISMATCH');
  }

  const senderKeyId = await sha256Base64Url(parsed.meta.senderPublicKey);
  const recipientKeyId = await sha256Base64Url(parsed.meta.recipientPublicKey);

  if (senderKeyId !== parsed.meta.senderKeyId || recipientKeyId !== parsed.meta.recipientKeyId) {
    throw new Error('PRIVATE_PAYLOAD_KEY_ID_MISMATCH');
  }

  return parsed;
}

export async function decryptMessage(payload: string, viewerAddress: string) {
  const viewerKeys = await readKeyPair(viewerAddress, undefined, false);
  const parsed = JSON.parse(payload) as EncryptedPayload;
  const viewerPrivateKey = await importPrivateKey(viewerKeys.privateKey);
  const viewerPublicKey = publicKeyString(viewerKeys.publicKey);

  if (parsed.version === 1) {
    const senderPublicKey = await importPublicKey(parsed.senderPublicKey);
    const aesKey = await deriveLegacyAesKey(viewerPrivateKey, senderPublicKey);
    return decryptCopy({ iv: parsed.iv, data: parsed.data }, aesKey);
  }

  if (parsed.version === 2) {
    const senderPublicKey = await importPublicKey(parsed.senderPublicKey);
    const aesKey = await deriveLegacyAesKey(viewerPrivateKey, senderPublicKey);
    const preferredCopy = viewerPublicKey === parsed.senderPublicKey ? parsed.sender : parsed.recipient;

    try {
      return await decryptCopy(preferredCopy, aesKey);
    } catch {
      const fallbackCopy = preferredCopy === parsed.sender ? parsed.recipient : parsed.sender;
      return decryptCopy(fallbackCopy, aesKey);
    }
  }

  if (parsed.version !== 3) {
    throw new Error('UNSUPPORTED_PRIVATE_PAYLOAD');
  }

  const isSender = viewerPublicKey === parsed.meta.senderPublicKey || normalizeAddress(viewerAddress) === parsed.meta.sender;
  const role = isSender ? 'sender' : 'recipient';
  const copy = isSender ? parsed.sender : parsed.recipient;
  const peerPublicKey = await importPublicKey(isSender ? parsed.meta.senderPublicKey : parsed.meta.senderPublicKey);
  const aad = aadFor(parsed.meta, role);
  const aesKey = await deriveV3AesKey(viewerPrivateKey, peerPublicKey, aad);

  return decryptCopy(copy, aesKey, aad);
}

export type GroupMemberEncryptionKey = {
  address: string;
  publicKey: string;
};

export type GroupCryptoContext = {
  chainId: number;
  contractAddress: string;
  groupId: bigint;
  senderAddress: string;
  membershipVersion: bigint;
};

export type GroupEncryptedMessage = {
  ciphertext: `0x${string}`;
  cryptoMeta: `0x${string}`;
  wrappedKeys: `0x${string}`[];
};

type GroupCryptoMetaV1 = {
  version: 1;
  alg: 'ECDH-P256-HKDF-SHA256-AES-256-GCM';
  chainId: number;
  contractAddress: string;
  groupId: string;
  sender: string;
  membershipVersion: string;
  senderPublicKey: string;
  senderKeyId: string;
};

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function hexToBytes(value: string) {
  if (!/^0x(?:[0-9a-fA-F]{2})*$/.test(value)) {
    throw new Error('GROUP_PAYLOAD_INVALID_HEX');
  }

  const bytes = new Uint8Array((value.length - 2) / 2);
  for (let i = 2; i < value.length; i += 2) {
    bytes[(i - 2) / 2] = Number.parseInt(value.slice(i, i + 2), 16);
  }
  return bytes;
}

function concatBytes(...values: Uint8Array[]) {
  const result = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  values.forEach((value) => {
    result.set(value, offset);
    offset += value.length;
  });
  return result;
}

async function sha256Bytes(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(value)));
}

function groupCommonAad(meta: GroupCryptoMetaV1) {
  return [
    'arcanum',
    'group',
    'v1',
    String(meta.chainId),
    normalizeAddress(meta.contractAddress),
    meta.groupId,
    normalizeAddress(meta.sender),
    meta.membershipVersion,
    meta.senderKeyId,
  ].join('|');
}

function groupRecipientAad(meta: GroupCryptoMetaV1, recipient: string, recipientKeyId: string) {
  return `${groupCommonAad(meta)}|${normalizeAddress(recipient)}|${recipientKeyId}`;
}

async function deriveGroupWrapKey(privateKey: CryptoKey, publicKey: CryptoKey, aad: string) {
  const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256);
  const material = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  const salt = await crypto.subtle.digest('SHA-256', textEncoder.encode(`arcanum:group:v1:salt:${aad}`));
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info: textEncoder.encode(`arcanum:group:v1:wrap:${aad}`),
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function parseGroupCryptoMeta(value: string) {
  let parsed: GroupCryptoMetaV1;
  try {
    parsed = JSON.parse(textDecoder.decode(hexToBytes(value))) as GroupCryptoMetaV1;
  } catch (error) {
    if (error instanceof Error && error.message === 'GROUP_PAYLOAD_INVALID_HEX') {
      throw error;
    }
    throw new Error('GROUP_META_INVALID');
  }

  if (parsed.version !== 1 || parsed.alg !== 'ECDH-P256-HKDF-SHA256-AES-256-GCM') {
    throw new Error('GROUP_META_UNSUPPORTED');
  }
  return parsed;
}

function assertGroupMetaContext(meta: GroupCryptoMetaV1, expected: GroupCryptoContext) {
  if (meta.chainId !== expected.chainId) throw new Error('GROUP_META_CHAIN_MISMATCH');
  if (normalizeAddress(meta.contractAddress) !== normalizeAddress(expected.contractAddress)) throw new Error('GROUP_META_CONTRACT_MISMATCH');
  if (meta.groupId !== expected.groupId.toString()) throw new Error('GROUP_META_ID_MISMATCH');
  if (normalizeAddress(meta.sender) !== normalizeAddress(expected.senderAddress)) throw new Error('GROUP_META_SENDER_MISMATCH');
  if (meta.membershipVersion !== expected.membershipVersion.toString()) throw new Error('GROUP_META_MEMBERSHIP_MISMATCH');
}

export async function encryptGroupMessage(
  message: string,
  memberKeys: readonly GroupMemberEncryptionKey[],
  context: GroupCryptoContext,
): Promise<GroupEncryptedMessage> {
  const messageBytes = textEncoder.encode(message);
  if (messageBytes.length === 0) throw new Error('GROUP_MESSAGE_REQUIRED');
  if (messageBytes.length > 2048) throw new Error('GROUP_MESSAGE_TOO_LARGE');
  if (memberKeys.length === 0 || memberKeys.length > 20) throw new Error('GROUP_MEMBER_COUNT_INVALID');

  const senderStored = await readKeyPair(context.senderAddress, undefined, false);
  const senderPublicKey = publicKeyString(senderStored.publicKey);
  const senderMember = memberKeys.find((member) => normalizeAddress(member.address) === normalizeAddress(context.senderAddress));
  if (!senderMember || senderMember.publicKey !== senderPublicKey) throw new Error('GROUP_SENDER_KEY_MISMATCH');

  const seen = new Set<string>();
  for (const member of memberKeys) {
    const normalized = normalizeAddress(member.address);
    if (seen.has(normalized)) throw new Error('GROUP_MEMBER_DUPLICATE');
    if (!member.publicKey) throw new Error('GROUP_MEMBER_KEY_REQUIRED');
    seen.add(normalized);
  }

  const meta: GroupCryptoMetaV1 = {
    version: 1,
    alg: 'ECDH-P256-HKDF-SHA256-AES-256-GCM',
    chainId: context.chainId,
    contractAddress: normalizeAddress(context.contractAddress),
    groupId: context.groupId.toString(),
    sender: normalizeAddress(context.senderAddress),
    membershipVersion: context.membershipVersion.toString(),
    senderPublicKey,
    senderKeyId: await sha256Base64Url(senderPublicKey),
  };
  const commonAad = groupCommonAad(meta);
  const senderPrivateKey = await importPrivateKey(senderStored.privateKey);
  const rawMessageKey = crypto.getRandomValues(new Uint8Array(32));
  const messageKey = await crypto.subtle.importKey('raw', rawMessageKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  const messageIv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedMessage = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: messageIv, additionalData: textEncoder.encode(commonAad) },
    messageKey,
    messageBytes,
  ));

  const wrappedKeys: `0x${string}`[] = [];
  for (const member of memberKeys) {
    const recipientKeyId = await sha256Bytes(member.publicKey);
    const recipientKeyIdText = encodeBase64Url(recipientKeyId);
    const recipientAad = groupRecipientAad(meta, member.address, recipientKeyIdText);
    const recipientPublicKey = await importPublicKey(member.publicKey);
    const wrapKey = await deriveGroupWrapKey(senderPrivateKey, recipientPublicKey, recipientAad);
    const wrapIv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedKey = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: wrapIv, additionalData: textEncoder.encode(recipientAad) },
      wrapKey,
      rawMessageKey,
    ));
    wrappedKeys.push(bytesToHex(concatBytes(recipientKeyId, wrapIv, encryptedKey)));
  }

  return {
    ciphertext: bytesToHex(concatBytes(messageIv, encryptedMessage)),
    cryptoMeta: bytesToHex(textEncoder.encode(JSON.stringify(meta))),
    wrappedKeys,
  };
}

export async function decryptGroupMessage(
  ciphertext: string,
  cryptoMeta: string,
  wrappedKey: string,
  viewerAddress: string,
  expected: GroupCryptoContext,
) {
  const meta = parseGroupCryptoMeta(cryptoMeta);
  assertGroupMetaContext(meta, expected);
  const stored = await readKeyPair(viewerAddress, undefined, false);
  const viewerPublicKey = publicKeyString(stored.publicKey);
  const expectedKeyId = await sha256Bytes(viewerPublicKey);
  const wrapped = hexToBytes(wrappedKey);
  if (wrapped.length !== 92) throw new Error('GROUP_WRAPPED_KEY_INVALID');

  const storedKeyId = wrapped.slice(0, 32);
  if (!storedKeyId.every((value, index) => value === expectedKeyId[index])) {
    throw new Error('GROUP_RECIPIENT_KEY_MISMATCH');
  }

  const senderKeyId = await sha256Base64Url(meta.senderPublicKey);
  if (senderKeyId !== meta.senderKeyId) throw new Error('GROUP_SENDER_KEY_ID_MISMATCH');

  const recipientKeyIdText = encodeBase64Url(storedKeyId);
  const recipientAad = groupRecipientAad(meta, viewerAddress, recipientKeyIdText);
  const viewerPrivateKey = await importPrivateKey(stored.privateKey);
  const senderPublicKey = await importPublicKey(meta.senderPublicKey);
  const wrapAesKey = await deriveGroupWrapKey(viewerPrivateKey, senderPublicKey, recipientAad);
  const rawMessageKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: wrapped.slice(32, 44), additionalData: textEncoder.encode(recipientAad) },
    wrapAesKey,
    wrapped.slice(44),
  );

  const encrypted = hexToBytes(ciphertext);
  if (encrypted.length < 29) throw new Error('GROUP_CIPHERTEXT_INVALID');
  const messageKey = await crypto.subtle.importKey('raw', rawMessageKey, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: encrypted.slice(0, 12), additionalData: textEncoder.encode(groupCommonAad(meta)) },
    messageKey,
    encrypted.slice(12),
  );
  return textDecoder.decode(plaintext);
}
