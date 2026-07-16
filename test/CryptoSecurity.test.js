const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');
const { webcrypto } = require('crypto');
const { TextDecoder, TextEncoder } = require('util');

function createLocalStorage() {
  const store = new Map();
  return {
    getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
    removeItem(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    },
  };
}

function loadCryptoModule() {
  global.crypto = webcrypto;
  global.TextEncoder = TextEncoder;
  global.TextDecoder = TextDecoder;
  global.btoa = (value) => Buffer.from(value, 'binary').toString('base64');
  global.atob = (value) => Buffer.from(value, 'base64').toString('binary');
  global.localStorage = createLocalStorage();

  const filename = path.join(__dirname, '..', 'lib', 'crypto.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

async function expectRejects(promise, message) {
  try {
    await promise;
  } catch (error) {
    expect(error.message).to.equal(message);
    return;
  }
  throw new Error(`Expected rejection ${message}`);
}

describe('crypto security hardening', function () {
  this.timeout(20000);

  const sender = '0x1111111111111111111111111111111111111111';
  const recipient = '0x2222222222222222222222222222222222222222';
  const contractAddress = '0x3333333333333333333333333333333333333333';
  const chainId = 5042002;

  it('stores local keys only as encrypted PBKDF2 AES-GCM records', async function () {
    const cryptoModule = loadCryptoModule();
    const keys = await cryptoModule.ensureEncryptionKeyPair(sender, 'correct horse battery staple');
    const stored = JSON.parse(localStorage.getItem(`arcanum.encryptionKey.${sender.toLowerCase()}`));

    expect(keys.publicKey).to.be.a('string');
    expect(stored.version).to.equal(2);
    expect(stored.app).to.equal('arcanum');
    expect(stored.type).to.equal('local-key');
    expect(stored.alg).to.equal('PBKDF2-SHA256-AES-GCM');
    expect(stored.data).to.be.a('string').and.not.equal('');
    expect(stored.privateKey).to.equal(undefined);
  });

  it('rejects legacy plaintext local key records instead of silently using them', async function () {
    const cryptoModule = loadCryptoModule();
    localStorage.setItem(
      `arcanum.encryptionKey.${sender.toLowerCase()}`,
      JSON.stringify({
        publicKey: { kty: 'EC', crv: 'P-256', x: 'legacy', y: 'legacy' },
        privateKey: { kty: 'EC', crv: 'P-256', d: 'legacy', x: 'legacy', y: 'legacy' },
      }),
    );

    await expectRejects(cryptoModule.unlockEncryptionKey(sender, 'passphrase'), 'LOCAL_KEY_REQUIRES_MIGRATION');
  });

  it('accepts valid v3 private payloads and rejects plaintext or mismatched payloads', async function () {
    const cryptoModule = loadCryptoModule();
    const senderKeys = await cryptoModule.ensureEncryptionKeyPair(sender, 'sender-passphrase');
    const recipientKeys = await cryptoModule.ensureEncryptionKeyPair(recipient, 'recipient-passphrase');
    const payload = await cryptoModule.encryptMessage(
      'private hello',
      recipientKeys.publicKey,
      sender,
      recipient,
      { chainId, contractAddress },
      'sender-passphrase',
    );

    await cryptoModule.assertPrivatePayloadV3(payload, {
      chainId,
      contractAddress,
      senderAddress: sender,
      recipientAddress: recipient,
      senderPublicKey: senderKeys.publicKey,
      recipientPublicKey: recipientKeys.publicKey,
    });

    await expectRejects(
      cryptoModule.assertPrivatePayloadV3('private hello', {
        chainId,
        contractAddress,
        senderAddress: sender,
        recipientAddress: recipient,
      }),
      'PRIVATE_PAYLOAD_INVALID_JSON',
    );

    const tampered = JSON.parse(payload);
    tampered.meta.recipient = sender;
    await expectRejects(
      cryptoModule.assertPrivatePayloadV3(JSON.stringify(tampered), {
        chainId,
        contractAddress,
        senderAddress: sender,
        recipientAddress: recipient,
      }),
      'PRIVATE_PAYLOAD_RECIPIENT_MISMATCH',
    );

    await expectRejects(
      cryptoModule.assertPrivatePayloadV3(payload, {
        chainId: chainId + 1,
        contractAddress,
        senderAddress: sender,
        recipientAddress: recipient,
      }),
      'PRIVATE_PAYLOAD_CHAIN_MISMATCH',
    );
  });

  it('binds escrow chat ciphertext to its chain, contract, conversation, and participants', async function () {
    const cryptoModule = loadCryptoModule();
    await cryptoModule.ensureEncryptionKeyPair(sender, 'sender-passphrase');
    const recipientKeys = await cryptoModule.ensureEncryptionKeyPair(recipient, 'recipient-passphrase');
    const context = {
      chainId,
      contractAddress,
      conversationId: `0x${'55'.repeat(32)}`,
      senderAddress: sender,
      recipientAddress: recipient,
    };
    const payload = await cryptoModule.encryptEscrowChatMessage(
      'escrow proposal note',
      recipientKeys.publicKey,
      context,
      'sender-passphrase',
    );

    await cryptoModule.assertEscrowChatPayload(payload, context);
    expect(await cryptoModule.decryptEscrowChatMessage(payload, recipient, context)).to.equal('escrow proposal note');
    await expectRejects(
      cryptoModule.assertEscrowChatPayload(payload, { ...context, conversationId: `0x${'66'.repeat(32)}` }),
      'ESCROW_PAYLOAD_CONVERSATION_MISMATCH',
    );
    await expectRejects(
      cryptoModule.assertEscrowChatPayload(payload, { ...context, contractAddress: '0x4444444444444444444444444444444444444444' }),
      'ESCROW_PAYLOAD_CONTRACT_MISMATCH',
    );
  });

  it('encrypts group metadata and messages per epoch and member envelope', async function () {
    const cryptoModule = loadCryptoModule();
    const ownerKeys = await cryptoModule.ensureEncryptionKeyPair(sender, 'owner-passphrase');
    const memberKeys = await cryptoModule.ensureEncryptionKeyPair(recipient, 'member-passphrase');
    const groupId = `0x${'44'.repeat(32)}`;
    const context = { chainId, contractAddress, groupId, epoch: 1 };
    const bundle = await cryptoModule.createGroupEncryption(
      'Core Team',
      sender,
      [
        { address: sender, publicKey: ownerKeys.publicKey },
        { address: recipient, publicKey: memberKeys.publicKey },
      ],
      context,
    );

    const ownerGroupKey = await cryptoModule.openGroupKeyEnvelope(bundle.envelopes[0], sender, context);
    const memberGroupKey = await cryptoModule.openGroupKeyEnvelope(bundle.envelopes[1], recipient, context);
    expect(memberGroupKey).to.equal(ownerGroupKey);
    expect(await cryptoModule.decryptGroupMetadata(bundle.encryptedMetadata, memberGroupKey, context)).to.deep.equal({ name: 'Core Team' });

    const payload = await cryptoModule.encryptGroupMessage('encrypted hello', ownerGroupKey, sender, context);
    expect(await cryptoModule.decryptGroupMessage(payload, memberGroupKey, { ...context, sender })).to.equal('encrypted hello');

    await expectRejects(
      cryptoModule.decryptGroupMessage(payload, memberGroupKey, { ...context, epoch: 2, sender }),
      'GROUP_EPOCH_MISMATCH',
    );
    await expectRejects(
      cryptoModule.openGroupKeyEnvelope(bundle.envelopes[1], sender, context),
      'GROUP_ENVELOPE_RECIPIENT_MISMATCH',
    );
  });
});
