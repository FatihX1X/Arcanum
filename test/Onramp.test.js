const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');
const { privateKeyToAccount } = require('viem/accounts');

const file = path.join(__dirname, '..', 'lib', 'onrampAuth.ts');
const loaded = new Module(file, module);
loaded.filename = file;
loaded.paths = Module._nodeModulePaths(path.dirname(file));
loaded._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, file);
const { createChallenge, verifyProof, onrampConfig, circleSessionInput, proofLifetimeMs } = loaded.exports;

describe('Onramp wallet authorization', function () {
  // Public, deterministic test keys only; never used on a live chain.
  const owner = privateKeyToAccount(`0x${'11'.repeat(32)}`);
  const other = privateKeyToAccount(`0x${'22'.repeat(32)}`);
  const origin = 'https://arcanumchat.xyz';
  const secret = 'test-only-onramp-secret-not-a-production-credential';
  const now = 1_800_000_000_000;

  it('fails closed without production configuration or a safe origin', function () {
    const before = { ...process.env };
    try {
      delete process.env.CIRCLE_API_KEY;
      expect(onrampConfig()).to.equal(null);
      Object.assign(process.env, { CIRCLE_API_KEY: 'test', ONRAMP_AUTH_SECRET: secret, ONRAMP_ORIGIN: origin });
      expect(onrampConfig().referrerDomain).to.equal('arcanumchat.xyz');
      for (const invalid of ['http://localhost:3000', `${origin}/path`, `${origin}/`, 'bad']) {
        process.env.ONRAMP_ORIGIN = invalid;
        expect(onrampConfig()).to.equal(null);
      }
      process.env.ONRAMP_ORIGIN = origin;
      process.env.ONRAMP_AUTH_SECRET = 'short';
      expect(onrampConfig()).to.equal(null);
    } finally {
      for (const key of ['CIRCLE_API_KEY', 'ONRAMP_AUTH_SECRET', 'ONRAMP_ORIGIN']) {
        if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
      }
    }
  });

  it('accepts a wallet proof and derives identity, destination and Arc assets on the server', async function () {
    const proof = createChallenge(owner.address, origin, secret, now);
    const signature = await owner.signMessage({ message: proof.message });
    const address = await verifyProof(proof.token, signature, origin, secret, now + 1);
    expect(address).to.equal(owner.address);
    expect(circleSessionInput(address)).to.deep.equal({ appUserId: `arc:5042:${owner.address.toLowerCase()}`, destinationAddress: owner.address, assets: { tokens: ['USDC', 'EURC'], chains: ['arc'] } });
  });

  it('rejects another signer, changed cookie, wrong domain, expired and future proofs', async function () {
    const proof = createChallenge(owner.address, origin, secret, now);
    const signature = await owner.signMessage({ message: proof.message });
    const wrong = await other.signMessage({ message: proof.message });
    expect(await verifyProof(proof.token, wrong, origin, secret, now)).to.equal(null);
    expect(await verifyProof(`A${proof.token}`, signature, origin, secret, now)).to.equal(null);
    expect(await verifyProof(proof.token, signature, 'https://attacker.example', secret, now)).to.equal(null);
    expect(await verifyProof(proof.token, signature, origin, secret, now + proofLifetimeMs)).to.equal(null);
    expect(await verifyProof(proof.token, signature, origin, secret, now - 1)).to.equal(null);
  });

  it('rejects empty/zero addresses and malformed signatures', async function () {
    expect(() => createChallenge('0x' + '0'.repeat(40), origin, secret)).to.throw('Invalid wallet');
    expect(() => createChallenge('', origin, secret)).to.throw('Invalid wallet');
    const proof = createChallenge(owner.address, origin, secret, now);
    expect(await verifyProof(proof.token, 'invalid', origin, secret, now)).to.equal(null);
  });
});
