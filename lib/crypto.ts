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

export type GroupCryptoContext = {
  chainId: number;
  contractAddress: string;
  groupId: `0x${string}`;
  epoch: number;
};

export type GroupMemberKey = {
  address: `0x${string}`;
  publicKey: string;
};

type GroupKeyEnvelopeV1 = {
  version: 1;
  alg: 'ECDH-P256-HKDF-SHA256-AES-GCM';
  meta: GroupCryptoContext & {
    distributor: string;
    recipient: string;
    distributorPublicKey: string;
    recipientPublicKey: string;
    distributorKeyId: string;
    recipientKeyId: string;
  };
  key: EncryptedCopy;
};

type GroupCipherV1 = {
  version: 1;
  alg: 'AES-256-GCM';
  kind: 'metadata' | 'message';
  meta: GroupCryptoContext & {
    sender?: string;
    nonce?: string;
  };
  copy: EncryptedCopy;
};

function groupContextAad(context: GroupCryptoContext) {
  return [
    'arcanum',
    'group-v1',
    String(context.chainId),
    normalizeAddress(context.contractAddress),
    context.groupId.toLowerCase(),
    String(context.epoch),
  ].join('|');
}

function groupEnvelopeAad(meta: GroupKeyEnvelopeV1['meta']) {
  return [
    groupContextAad(meta),
    'key-envelope',
    normalizeAddress(meta.distributor),
    normalizeAddress(meta.recipient),
    meta.distributorKeyId,
    meta.recipientKeyId,
  ].join('|');
}

function groupCipherAad(payload: GroupCipherV1) {
  const base = [groupContextAad(payload.meta), payload.kind];
  if (payload.kind === 'message') {
    base.push(normalizeAddress(payload.meta.sender ?? ''), payload.meta.nonce ?? '');
  }
  return base.join('|');
}

async function importGroupKey(groupKey: string) {
  return crypto.subtle.importKey('raw', decodeBase64Url(groupKey), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

function assertGroupContext(actual: GroupCryptoContext, expected: GroupCryptoContext) {
  if (actual.chainId !== expected.chainId) throw new Error('GROUP_CHAIN_MISMATCH');
  if (normalizeAddress(actual.contractAddress) !== normalizeAddress(expected.contractAddress)) throw new Error('GROUP_CONTRACT_MISMATCH');
  if (actual.groupId.toLowerCase() !== expected.groupId.toLowerCase()) throw new Error('GROUP_ID_MISMATCH');
  if (actual.epoch !== expected.epoch) throw new Error('GROUP_EPOCH_MISMATCH');
}

export function createRandomGroupId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}` as `0x${string}`;
}

export async function createGroupEncryption(
  name: string,
  ownerAddress: `0x${string}`,
  members: GroupMemberKey[],
  context: GroupCryptoContext,
) {
  const ownerKeys = await readKeyPair(ownerAddress, undefined, false);
  const ownerPrivateKey = await importPrivateKey(ownerKeys.privateKey);
  const distributorPublicKey = publicKeyString(ownerKeys.publicKey);
  const registeredOwner = members.find((member) => normalizeAddress(member.address) === normalizeAddress(ownerAddress));
  if (!registeredOwner || registeredOwner.publicKey !== distributorPublicKey) {
    throw new Error('GROUP_OWNER_KEY_MISMATCH');
  }
  const distributorKeyId = await sha256Base64Url(distributorPublicKey);
  const rawGroupKey = crypto.getRandomValues(new Uint8Array(32));
  const groupKey = encodeBase64Url(rawGroupKey);
  const aesKey = await importGroupKey(groupKey);

  const envelopes = await Promise.all(members.map(async (member) => {
    const recipientKey = await importPublicKey(member.publicKey);
    const meta: GroupKeyEnvelopeV1['meta'] = {
      ...context,
      distributor: normalizeAddress(ownerAddress),
      recipient: normalizeAddress(member.address),
      distributorPublicKey,
      recipientPublicKey: member.publicKey,
      distributorKeyId,
      recipientKeyId: await sha256Base64Url(member.publicKey),
    };
    const aad = groupEnvelopeAad(meta);
    const envelopeKey = await deriveV3AesKey(ownerPrivateKey, recipientKey, aad);
    const envelope: GroupKeyEnvelopeV1 = {
      version: 1,
      alg: 'ECDH-P256-HKDF-SHA256-AES-GCM',
      meta,
      key: await encryptCopy(groupKey, envelopeKey, aad),
    };
    return JSON.stringify(envelope);
  }));

  const metadata: GroupCipherV1 = {
    version: 1,
    alg: 'AES-256-GCM',
    kind: 'metadata',
    meta: context,
    copy: { iv: '', data: '' },
  };
  metadata.copy = await encryptCopy(JSON.stringify({ name }), aesKey, groupCipherAad(metadata));

  return { groupKey, encryptedMetadata: JSON.stringify(metadata), envelopes };
}

export async function openGroupKeyEnvelope(
  envelopeJson: string,
  viewerAddress: `0x${string}`,
  expected: GroupCryptoContext,
) {
  const envelope = JSON.parse(envelopeJson) as GroupKeyEnvelopeV1;
  if (envelope.version !== 1 || envelope.alg !== 'ECDH-P256-HKDF-SHA256-AES-GCM' || !isEncryptedCopy(envelope.key)) {
    throw new Error('GROUP_ENVELOPE_INVALID');
  }
  assertGroupContext(envelope.meta, expected);
  if (normalizeAddress(envelope.meta.recipient) !== normalizeAddress(viewerAddress)) {
    throw new Error('GROUP_ENVELOPE_RECIPIENT_MISMATCH');
  }
  if (await sha256Base64Url(envelope.meta.distributorPublicKey) !== envelope.meta.distributorKeyId) {
    throw new Error('GROUP_ENVELOPE_DISTRIBUTOR_KEY_MISMATCH');
  }
  if (await sha256Base64Url(envelope.meta.recipientPublicKey) !== envelope.meta.recipientKeyId) {
    throw new Error('GROUP_ENVELOPE_RECIPIENT_KEY_MISMATCH');
  }

  const viewerKeys = await readKeyPair(viewerAddress, undefined, false);
  if (publicKeyString(viewerKeys.publicKey) !== envelope.meta.recipientPublicKey) {
    throw new Error('GROUP_ENVELOPE_LOCAL_KEY_MISMATCH');
  }
  const viewerPrivateKey = await importPrivateKey(viewerKeys.privateKey);
  const distributorKey = await importPublicKey(envelope.meta.distributorPublicKey);
  const aad = groupEnvelopeAad(envelope.meta);
  const envelopeKey = await deriveV3AesKey(viewerPrivateKey, distributorKey, aad);
  return decryptCopy(envelope.key, envelopeKey, aad);
}

export async function decryptGroupMetadata(
  encryptedMetadata: string,
  groupKey: string,
  expected: GroupCryptoContext,
) {
  const payload = JSON.parse(encryptedMetadata) as GroupCipherV1;
  if (payload.version !== 1 || payload.alg !== 'AES-256-GCM' || payload.kind !== 'metadata' || !isEncryptedCopy(payload.copy)) {
    throw new Error('GROUP_METADATA_INVALID');
  }
  assertGroupContext(payload.meta, expected);
  const aesKey = await importGroupKey(groupKey);
  const decrypted = await decryptCopy(payload.copy, aesKey, groupCipherAad(payload));
  return JSON.parse(decrypted) as { name: string };
}

export async function encryptGroupMessage(
  message: string,
  groupKey: string,
  senderAddress: `0x${string}`,
  context: GroupCryptoContext,
) {
  const payload: GroupCipherV1 = {
    version: 1,
    alg: 'AES-256-GCM',
    kind: 'message',
    meta: {
      ...context,
      sender: normalizeAddress(senderAddress),
      nonce: encodeBase64Url(crypto.getRandomValues(new Uint8Array(16))),
    },
    copy: { iv: '', data: '' },
  };
  const aesKey = await importGroupKey(groupKey);
  payload.copy = await encryptCopy(message, aesKey, groupCipherAad(payload));
  return JSON.stringify(payload);
}

export async function decryptGroupMessage(
  payloadJson: string,
  groupKey: string,
  expected: GroupCryptoContext & { sender?: string },
) {
  const payload = JSON.parse(payloadJson) as GroupCipherV1;
  if (payload.version !== 1 || payload.alg !== 'AES-256-GCM' || payload.kind !== 'message' || !isEncryptedCopy(payload.copy)) {
    throw new Error('GROUP_MESSAGE_INVALID');
  }
  assertGroupContext(payload.meta, expected);
  if (expected.sender && normalizeAddress(payload.meta.sender ?? '') !== normalizeAddress(expected.sender)) {
    throw new Error('GROUP_MESSAGE_SENDER_MISMATCH');
  }
  const aesKey = await importGroupKey(groupKey);
  return decryptCopy(payload.copy, aesKey, groupCipherAad(payload));
}
