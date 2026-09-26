const { expect } = require('chai');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const { NextRequest } = require('next/server');
const { privateKeyToAccount } = require('viem/accounts');

describe('Onramp session API', function () {
  const origin = 'https://arcanumchat.xyz';
  const secret = 'test-only-secret-32-bytes-never-used-on-mainnet';
  const account = privateKeyToAccount(`0x${'33'.repeat(32)}`);
  let apiInput;
  let kitConfig;
  let upstreamError;
  const modules = new Map();
  function load(relative) {
    const filename = path.resolve(__dirname, '..', relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const mod = new Module(filename, module);
    modules.set(filename, mod);
    mod.filename = filename;
    mod.paths = Module._nodeModulePaths(path.dirname(filename));
    const original = mod.require.bind(mod);
    mod.require = (id) => {
      if (id.endsWith('lib/onrampAuth')) return load('lib/onrampAuth.ts');
      if (id === '@circle-fin/app-kit/server') return { createAppServerKit(config) {
        kitConfig = config;
        return { onramp: { async createSession(input) { apiInput = input; if (upstreamError) throw upstreamError; return { sessionToken: 'mock-session' }; } } };
      } };
      return original(id);
    };
    mod._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
    return mod.exports;
  }
  const auth = load('lib/onrampAuth.ts');
  const route = load('app/api/onramp/sessions/route.ts');
  const challengeRoute = load('app/api/onramp/challenge/route.ts');
  const saved = {};
  beforeEach(() => {
    for (const key of ['CIRCLE_API_KEY', 'ONRAMP_AUTH_SECRET', 'ONRAMP_ORIGIN']) saved[key] = process.env[key];
    Object.assign(process.env, { CIRCLE_API_KEY: 'mock-key', ONRAMP_AUTH_SECRET: secret, ONRAMP_ORIGIN: origin });
    apiInput = undefined; upstreamError = undefined;
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  });
  async function request(bodyExtra = {}, requestOrigin = origin) {
    const proof = auth.createChallenge(account.address, origin, secret);
    const signature = await account.signMessage({ message: proof.message });
    return new NextRequest(`${origin}/api/onramp/sessions`, { method: 'POST', headers: { origin: requestOrigin, 'Content-Type': 'application/json', cookie: `${auth.onrampCookie}=${proof.token}` }, body: JSON.stringify({ signature, ...bodyExtra }) });
  }

  it('returns 503 when configuration is missing without calling Circle', async function () {
    delete process.env.CIRCLE_API_KEY;
    const response = await route.POST(await request());
    expect(response.status).to.equal(503);
    expect(response.headers.get('cache-control')).to.equal('no-store');
    expect(apiInput).to.equal(undefined);
  });
  it('rejects untrusted origins, absent authentication and client destination overrides', async function () {
    expect((await route.POST(await request({}, 'https://attacker.example'))).status).to.equal(403);
    expect((await route.POST(new NextRequest(`${origin}/api/onramp/sessions`, { method: 'POST', headers: { origin }, body: '{}' }))).status).to.equal(401);
    expect((await route.POST(await request({ destinationAddress: '0x' + '44'.repeat(20) }))).status).to.equal(400);
    expect(apiInput).to.equal(undefined);
  });
  it('mints only Arc mainnet assets to the verified wallet and clears the cookie', async function () {
    const response = await route.POST(await request());
    expect(response.status).to.equal(200);
    expect(apiInput.destinationAddress).to.equal(account.address);
    expect(apiInput.assets.chains).to.deep.equal(['arc']);
    expect(kitConfig.onramp.baseUrl).to.equal('https://api.circle.com');
    expect(kitConfig.onramp.widgetBaseUrl).to.equal('https://onramp.arc.io');
    expect(kitConfig.onramp.referrerDomain).to.equal('arcanumchat.xyz');
    expect(response.headers.get('set-cookie')).to.include('Max-Age=0');
  });
  it('sanitizes upstream errors and preserves rate-limit status', async function () {
    upstreamError = { type: 'RATE_LIMIT', message: 'sensitive-upstream-content' };
    const response = await route.POST(await request());
    expect(response.status).to.equal(429);
    expect(await response.text()).not.to.include('sensitive');
  });
  it('bounds challenge request size before signature or upstream work', async function () {
    const response = await challengeRoute.POST(new NextRequest(`${origin}/api/onramp/challenge`, { method: 'POST', headers: { origin }, body: 'x'.repeat(300) }));
    expect(response.status).to.equal(400);
    expect(apiInput).to.equal(undefined);
  });
});
