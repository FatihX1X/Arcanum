const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

function loadCircleSwapModule() {
  const filename = path.join(__dirname, '..', 'lib', 'circleSwap.ts');
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

describe('Circle swap safeguards (Arc mainnet)', function () {
  const swap = loadCircleSwapModule();
  const account = '0x1111111111111111111111111111111111111111';

  it('targets Arc mainnet', function () {
    expect(swap.arcSwapChainId).to.equal(5042);
    expect(swap.circleSwapChain).to.equal('Arc');
  });

  it('accepts only six-decimal amount input and converts it without floating point math', function () {
    expect(swap.isSwapAmountInput('123.456789')).to.equal(true);
    expect(swap.isSwapAmountInput('.5')).to.equal(true);
    expect(swap.isSwapAmountInput('1.0000001')).to.equal(false);
    expect(swap.isSwapAmountInput('1e6')).to.equal(false);
    expect(swap.normalizeSwapAmount('0001.230000')).to.equal('1.23');
    expect(swap.parseSwapAmount('.5')).to.equal(500000n);
    expect(swap.parseSwapAmount('0')).to.equal(null);
    expect(swap.formatSwapUnits(123456789n)).to.equal('123.456789');
  });

  it('expires quotes after thirty seconds', function () {
    expect(swap.isFreshSwapQuote(10_000, 39_999)).to.equal(true);
    expect(swap.isFreshSwapQuote(10_000, 40_000)).to.equal(false);
    expect(swap.isFreshSwapQuote(0, 1)).to.equal(false);
  });

  it('keeps a buffered native-USDC gas reserve when Max is used', function () {
    expect(swap.estimateGasReserveUsdc()).to.equal(50_000n);
    expect(swap.estimateGasReserveUsdc(1_000_000_000_000n)).to.equal(900_000n);
    expect(swap.maxSpendableSwapBalance('USDC', 10_000_000n, 1_000_000_000_000n)).to.equal(9_100_000n);
    expect(swap.maxSpendableSwapBalance('EURC', 10_000_000n, 1_000_000_000_000n)).to.equal(10_000_000n);
  });

  it('calculates the displayed quote rate from six-decimal amounts', function () {
    expect(swap.quoteExchangeRate('10', '9.25')).to.equal(0.925);
    expect(swap.quoteExchangeRate('0', '9.25')).to.equal(null);
  });

  it('rewrites only Circle Stablecoin Kit requests to the same-origin proxy', function () {
    expect(swap.circleSwapProxyUrl(
      'https://api.circle.com/v1/stablecoinKits/swap?foo=bar',
      'https://www.arcanumchat.xyz',
    )).to.equal('https://www.arcanumchat.xyz/api/circle-swap/swap?foo=bar');
    expect(swap.circleSwapProxyUrl(
      'https://api.circle.com/v1/stablecoinKits/swap/status?txHash=0x1',
      'https://www.arcanumchat.xyz',
    )).to.equal('https://www.arcanumchat.xyz/api/circle-swap/swap/status?txHash=0x1');
    expect(swap.circleSwapProxyUrl(
      'https://example.com/v1/stablecoinKits/swap',
      'https://www.arcanumchat.xyz',
    )).to.equal(null);
  });

  it('classifies wallet, balance, stale quote, rate limit, and route failures', function () {
    expect(swap.swapErrorKind(new Error('User rejected the request'))).to.equal('rejected');
    expect(swap.swapErrorKind(new Error('WALLET_ACCOUNT_MISMATCH'))).to.equal('wallet-provider');
    expect(swap.swapErrorKind(new Error('Stablecoin Service createSwap failed: Failed to fetch')))
      .to.equal('service-unavailable');
    expect(swap.swapErrorKind(new Error('insufficient funds for gas'))).to.equal('insufficient-balance');
    expect(swap.swapErrorKind(new Error('stale quote'))).to.equal('quote-expired');
    expect(swap.swapErrorKind({ cause: { details: '429 Too Many Requests' } })).to.equal('rate-limited');
    expect(swap.swapErrorKind(new Error('No route with enough liquidity'))).to.equal('route-unavailable');
  });

  it('scopes the Circle adapter to the account selected by the active connector', async function () {
    const calls = [];
    const provider = swap.createAccountScopedSwapProvider({
      async request(args) {
        calls.push(args.method);
        if (args.method === 'eth_accounts') {
          return [
            '0x0000000000000000000000000000000000000001',
            account,
          ];
        }
        return '0x13b2';
      },
    }, account);

    expect(await provider.request({ method: 'eth_accounts' })).to.deep.equal([account]);
    expect(await provider.request({ method: 'eth_chainId' })).to.equal('0x13b2');
    expect(calls).to.deep.equal(['eth_accounts', 'eth_chainId']);
  });

  it('rejects a connector provider that does not expose the connected account', async function () {
    const provider = swap.createAccountScopedSwapProvider({
      async request() {
        return ['0x0000000000000000000000000000000000000001'];
      },
    }, account);

    let error;
    try {
      await provider.request({ method: 'eth_accounts' });
    } catch (caught) {
      error = caught;
    }
    expect(error).to.be.instanceOf(Error);
    expect(error.message).to.equal('WALLET_ACCOUNT_MISMATCH');
  });

  it('accepts an intact mock estimate from the connected account', function () {
    const estimate = {
      amountIn: '1.00',
      chainIn: 'Arc',
      chainOut: 'Arc',
      fromAddress: account,
      toAddress: account,
      tokenIn: 'USDC',
      tokenOut: 'EURC',
    };

    expect(() => swap.assertSwapEstimateIntegrity(estimate, {
      account,
      amountIn: '1',
      tokenIn: 'USDC',
      tokenOut: 'EURC',
    })).not.to.throw();
  });

  it('rejects a mock provider response that changes chain, recipient, amount, or tokens', function () {
    const base = {
      amountIn: '1',
      chainIn: 'Arc',
      chainOut: 'Arc',
      fromAddress: account,
      toAddress: account,
      tokenIn: 'USDC',
      tokenOut: 'EURC',
    };
    const expected = {
      account,
      amountIn: '1',
      tokenIn: 'USDC',
      tokenOut: 'EURC',
    };

    expect(() => swap.assertSwapEstimateIntegrity({ ...base, chainOut: 'Base' }, expected))
      .to.throw('SWAP_ESTIMATE_CHAIN_MISMATCH');
    expect(() => swap.assertSwapEstimateIntegrity({ ...base, toAddress: '0x2222222222222222222222222222222222222222' }, expected))
      .to.throw('SWAP_ESTIMATE_ACCOUNT_MISMATCH');
    expect(() => swap.assertSwapEstimateIntegrity({ ...base, amountIn: '2' }, expected))
      .to.throw('SWAP_ESTIMATE_AMOUNT_MISMATCH');
    expect(() => swap.assertSwapEstimateIntegrity({ ...base, tokenOut: 'USDC' }, expected))
      .to.throw('SWAP_ESTIMATE_TOKEN_MISMATCH');
  });
});
