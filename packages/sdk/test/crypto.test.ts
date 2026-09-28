import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertEscrowChatPayload,
  assertPrivatePayloadV3,
  configureKeyStorage,
  createMemoryKeyStorage,
  decryptEscrowChatMessage,
  decryptGroupMessage,
  decryptMessage,
  ensureEncryptionKeyPair,
  encryptEscrowChatMessage,
  encryptGroupMessage,
  encryptMessage,
  exportEncryptionKey,
  importEncryptionKey,
} from '../src/crypto';

const sender = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const contractAddress = '0x3333333333333333333333333333333333333333';

describe('Arcanum crypto', () => {
  beforeEach(() => configureKeyStorage(createMemoryKeyStorage()));

  it('imports without browser storage and only requires storage when key operations run', async () => {
    expect(typeof encryptMessage).toBe('function');
  });

  it('round-trips private messages and rejects a mismatched context', async () => {
    const senderKey = await ensureEncryptionKeyPair(sender, 'sender-passphrase');
    const recipientKey = await ensureEncryptionKeyPair(recipient, 'recipient-passphrase');
    const context = { chainId: 5042, contractAddress };
    const payload = await encryptMessage('hello', recipientKey.publicKey, sender, recipient, context, 'sender-passphrase');
    expect(await decryptMessage(payload, recipient)).toBe('hello');
    await expect(assertPrivatePayloadV3(payload, { ...context, senderAddress: sender, recipientAddress: sender })).rejects.toThrow('PRIVATE_PAYLOAD_RECIPIENT_MISMATCH');
    expect(senderKey.publicKey).not.toBe(recipientKey.publicKey);
  });

  it('exports and restores an encrypted key backup', async () => {
    const original = await ensureEncryptionKeyPair(sender, 'backup-passphrase');
    const backup = await exportEncryptionKey(sender, 'backup-passphrase');
    configureKeyStorage(createMemoryKeyStorage());
    const restored = await importEncryptionKey(sender, backup, 'backup-passphrase');
    expect(restored.publicKey).toBe(original.publicKey);
  });

  it('binds escrow messages to their conversation', async () => {
    await ensureEncryptionKeyPair(sender, 'sender-passphrase');
    const recipientKey = await ensureEncryptionKeyPair(recipient, 'recipient-passphrase');
    const context = { chainId: 5042, contractAddress, conversationId: 9n, senderAddress: sender, recipientAddress: recipient };
    const payload = await encryptEscrowChatMessage('terms', recipientKey.publicKey, context, 'sender-passphrase');
    await assertEscrowChatPayload(payload, context);
    expect(await decryptEscrowChatMessage(payload, recipient, context)).toBe('terms');
    await expect(assertEscrowChatPayload(payload, { ...context, conversationId: 10n })).rejects.toThrow('ESCROW_PAYLOAD_CONVERSATION_MISMATCH');
  });

  it('binds group messages to their epoch', async () => {
    const groupKey = crypto.getRandomValues(new Uint8Array(32));
    const encoded = btoa(String.fromCharCode(...groupKey)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const context = { chainId: 5042, contractAddress, groupId: `0x${'44'.repeat(32)}` as `0x${string}`, epoch: 1 };
    const payload = await encryptGroupMessage('group hello', encoded, sender, context);
    expect(await decryptGroupMessage(payload, encoded, { ...context, sender })).toBe('group hello');
    await expect(decryptGroupMessage(payload, encoded, { ...context, epoch: 2, sender })).rejects.toThrow('GROUP_EPOCH_MISMATCH');
  });
});
