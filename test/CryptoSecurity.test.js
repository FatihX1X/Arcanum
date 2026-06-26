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
});
