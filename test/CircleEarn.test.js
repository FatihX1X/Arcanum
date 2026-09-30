const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

function load(relative = 'lib/circleEarn.ts', dependencies = {}) {
  const filename = path.join(__dirname, '..', relative);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  const requireDependency = mod.require.bind(mod);
  mod.require = request => dependencies[request] ?? requireDependency(request);
  mod._compile(output, filename);
  return mod.exports;
}

describe('Circle Earn safeguards', () => {
  const earn = load();
  it('allows low-liquidity deposit previews without opening inactive or unknown vaults', () => {
    for (const status of ['active', 'low_liquidity']) expect(earn.earnDepositAllowed(status)).to.equal(true);
    for (const status of ['inactive', 'paused', 'deprecated', '', undefined]) expect(earn.earnDepositAllowed(status)).to.equal(false);
    expect(earn.earnMaximum('deposit', 7182580n, 0n, 100000n, 'USDC')).to.equal(7082580n);
    expect(earn.earnMaximum('withdraw', 7182580n, 0n, 100000n, 'USDC')).to.equal(0n);
  });
  it('parses six-decimal values exactly and rejects malformed SDK inputs', () => {
    expect(earn.parseEarnAmount('9007199254740993.123456')).to.equal(9007199254740993123456n);
    for (const input of ['0', '-1', '.5', '00.5', '1e3', '1.1234567', 'NaN', '1.']) expect(earn.parseEarnAmount(input)).to.equal(null);
  });
  it('reserves native USDC gas without subtracting it from EURC', () => {
    expect(earn.earnMaximum('deposit', 1000000n, 0n, 100000n, 'USDC')).to.equal(900000n);
    expect(earn.earnMaximum('deposit', 50000n, 0n, 100000n, 'USDC')).to.equal(0n);
    expect(earn.earnMaximum('deposit', 1000000n, 0n, 100000n, 'EURC')).to.equal(1000000n);
  });
  it('bounds withdrawals by both position value and liquidity', () => {
    expect(earn.earnMaximum('withdraw', 500000n, 200000n, 0n, 'USDC')).to.equal(200000n);
    expect(earn.earnMaximum('withdraw', 100000n, 200000n, 0n, 'USDC')).to.equal(100000n);
  });
  it('invalidates quotes on intent change, expiry and clock reversal', () => {
    const quote = { key: 'account:chain:vault:action:amount', at: 1000 };
    expect(earn.earnQuoteMatches(quote, quote.key, 2000)).to.equal(true);
    expect(earn.earnQuoteMatches(quote, 'changed', 2000)).to.equal(false);
    expect(earn.earnQuoteMatches(quote, quote.key, 31000)).to.equal(false);
    expect(earn.earnQuoteMatches(quote, quote.key, 999)).to.equal(false);
  });
  it('permits only necessary Earn endpoints and methods', () => {
    expect(earn.earnProxyPathAllowed('GET', 'vaults/explore')).to.equal(true);
    expect(earn.earnProxyPathAllowed('POST', 'deposit/quote')).to.equal(true);
    for (const path of ['../wallets', 'bridge/deposit/prepare', 'deposit/anything', 'position/not-an-address']) expect(earn.earnProxyPathAllowed('GET', path)).to.equal(false);
    expect(earn.earnProxyPathAllowed('GET', 'deposit')).to.equal(false);
    expect(earn.earnProxyPathAllowed('DELETE', 'withdraw')).to.equal(false);
  });
  it('classifies wallet rejection, network changes and rate limits', () => {
    expect(earn.earnError(new Error('4001 rejected'), false)).to.include('cancelled');
    expect(earn.earnError(new Error('429 rate limit'), false)).to.include('Rate limit');
    expect(earn.earnError(new Error('chain changed'), false)).to.include('Arc mainnet');
  });
  it('converts quote gas from native 18 decimals to six-decimal reserve with a buffer', () => {
    expect(earn.earnGasReserve([{ fees: { fee: '100000000000000000' } }], 50000n)).to.equal(120000n);
    expect(earn.earnGasReserve([{ fees: null }], 50000n)).to.equal(50000n);
  });
  it('rejects quote substitutions of vault, asset or amount', () => {
    const vault = { vaultAddress: '0x111', asset: 'USDC' };
    const quote = { vaultAddress: '0x111', deposit: { amount: '10', symbol: 'USDC' } };
    expect(() => earn.assertEarnQuote(quote, vault, '10.00')).not.to.throw();
    expect(() => earn.assertEarnQuote({ ...quote, vaultAddress: '0x222' }, vault, '10')).to.throw();
    expect(() => earn.assertEarnQuote({ ...quote, deposit: { amount: '11', symbol: 'USDC' } }, vault, '10')).to.throw();
    expect(() => earn.assertEarnQuote({ ...quote, deposit: { amount: '10', symbol: 'EURC' } }, vault, '10')).to.throw();
  });
  it('blocks signing after account, chain or intent changes', async () => {
    const account = '0x1111111111111111111111111111111111111111';
    let accounts = [account], chain = '0x13b2', current = true, writes = 0;
    const provider = { async request({ method }) {
      if (method === 'eth_accounts') return accounts;
      if (method === 'eth_chainId') return chain;
      writes++; return 'signed';
    } };
    const scoped = await earn.createEarnScopedProvider(provider, account, () => current);
    for (const mutate of [() => { accounts = ['0x2222222222222222222222222222222222222222']; }, () => { chain = '0x1'; }, () => { current = false; }]) {
      accounts = [account]; chain = '0x13b2'; current = true; mutate();
      let rejected = false;
      try { await scoped.request({ method: 'eth_sendTransaction' }); } catch { rejected = true; }
      expect(rejected).to.equal(true);
    }
    expect(writes).to.equal(0);
  });
  it('records submitted execution hashes but does not classify token approvals as deposits', async () => {
    const account = '0x1111111111111111111111111111111111111111';
    const hash = '0x' + 'a'.repeat(64), records = [];
    const scoped = await earn.createEarnScopedProvider({ async request({ method }) { return method === 'eth_accounts' ? [account] : method === 'eth_chainId' ? '0x13b2' : hash; } }, account, () => true, value => records.push(value));
    await scoped.request({ method: 'eth_sendTransaction', params: [{ data: '0x095ea7b300' }] });
    expect(records).to.deep.equal([]);
    await scoped.request({ method: 'eth_sendTransaction', params: [{ data: '0x12345678' }] });
    expect(records).to.deep.equal([hash]);
  });
});

describe('Earn API proxy', () => {
  const { NextRequest } = require('next/server');
  const earn = load();
  let proxy, originalFetch;
  beforeEach(() => {
    proxy = load('app/v1/earnKit/[...path]/route.ts', { '../../../../lib/circleEarn': earn });
    originalFetch = global.fetch;
  });
  afterEach(() => { global.fetch = originalFetch; });
  const context = path => ({ params: Promise.resolve({ path: path.split('/') }) });
  const request = (path, init = {}) => new NextRequest(`https://arcanum.test/v1/earnKit/${path}`, init);

  it('rejects unsupported endpoints and testnet before contacting Circle', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; return Response.json({}); };
    expect((await proxy.GET(request('bridge/deposit/prepare'), context('bridge/deposit/prepare'))).status).to.equal(404);
    expect((await proxy.GET(request('vaults/explore?chain=ARC-TESTNET'), context('vaults/explore'))).status).to.equal(400);
    expect((await proxy.POST(request('deposit', { method: 'POST', body: JSON.stringify({ chain: 'ARC-TESTNET' }) }), context('deposit'))).status).to.equal(400);
    expect(calls).to.equal(0);
  });
  it('rejects cross-origin requests, malformed JSON and oversized bodies', async () => {
    global.fetch = async () => { throw new Error('Should not reach upstream'); };
    expect((await proxy.GET(request('vaults?chain=ARC', { headers: { origin: 'https://other.test' } }), context('vaults'))).status).to.equal(403);
    expect((await proxy.POST(request('deposit', { method: 'POST', body: '{' }), context('deposit'))).status).to.equal(400);
    expect((await proxy.POST(request('deposit', { method: 'POST', body: 'x'.repeat(65537) }), context('deposit'))).status).to.equal(413);
  });
  it('forwards only to Circle and replaces browser credentials with the server-only key', async () => {
    const previousKey = process.env.CIRCLE_EARN_API_KEY;
    process.env.CIRCLE_EARN_API_KEY = 'test-server-key';
    try {
      let captured;
      global.fetch = async (url, init) => { captured = { url, init }; return Response.json({ data: { vaults: [] } }); };
      const response = await proxy.GET(request('vaults/explore?chain=ARC', { headers: { authorization: 'browser-key' } }), context('vaults/explore'));
      expect(response.status).to.equal(200);
      expect(captured.url.origin).to.equal('https://api.circle.com');
      expect(captured.url.pathname).to.equal('/v1/earnKit/vaults/explore');
      expect(captured.init.headers.get('Authorization')).to.equal('Bearer test-server-key');
      expect(response.headers.get('cache-control')).to.equal('no-store');
      expect(JSON.stringify(await response.json())).not.to.include('test-server-key');
    } finally { if (previousKey === undefined) delete process.env.CIRCLE_EARN_API_KEY; else process.env.CIRCLE_EARN_API_KEY = previousKey; }
  });
  it('returns a sanitized service failure without retrying prepared operations', async () => {
    let calls = 0;
    global.fetch = async () => { calls++; throw new Error('private upstream details'); };
    const response = await proxy.POST(request('withdraw', { method: 'POST', body: JSON.stringify({ chain: 'ARC' }) }), context('withdraw'));
    expect(response.status).to.equal(502);
    expect(JSON.stringify(await response.json())).not.to.include('private upstream details');
    expect(calls).to.equal(1);
  });
  it('limits repeated requests per instance', async () => {
    global.fetch = async () => Response.json({});
    for (let i = 0; i < 180; i++) await proxy.GET(request('vaults?chain=ARC'), context('vaults'));
    const response = await proxy.GET(request('vaults?chain=ARC'), context('vaults'));
    expect(response.status).to.equal(429);
    expect(response.headers.get('Retry-After')).to.equal('60');
  });
});
