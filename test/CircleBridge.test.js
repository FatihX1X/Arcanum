const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

require.extensions['.ts'] = function compileTypeScript(mod, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  mod._compile(output, filename);
};

function loadTypeScriptModule(relativePath) {
  const filename = path.join(__dirname, '..', relativePath);
  delete require.cache[filename];
  return require(filename);
}

describe('Circle Bridge safeguards', function () {
  const chains = loadTypeScriptModule('lib/bridgeChains.ts');
  const bridge = loadTypeScriptModule('lib/circleBridge.ts');
  const rpcProxy = loadTypeScriptModule('lib/rpcProxy.ts');
  const account = '0x1111111111111111111111111111111111111111';

  it('exposes only EVM testnets and requires exactly one Arc endpoint', function () {
    expect(chains.bridgeEvmTestnets).to.have.length.greaterThan(2);
    expect(chains.bridgeEvmTestnets.every((chain) => chain.type === 'evm' && chain.isTestnet)).to.equal(true);
    expect(chains.isSupportedArcBridgeRoute(chains.arcBridgeChain, chains.defaultBridgeCounterpart)).to.equal(true);
    expect(chains.isSupportedArcBridgeRoute(chains.defaultBridgeCounterpart, chains.arcBridgeChain)).to.equal(true);
    expect(chains.isSupportedArcBridgeRoute(chains.arcBridgeChain, chains.arcBridgeChain)).to.equal(false);
  });

  it('limits Arc destinations to Circle Forwarder-supported testnets', function () {
    const destinations = chains.bridgeDestinationsFor(chains.arcBridgeChain);
    expect(destinations).to.not.be.empty;
    expect(destinations.every((chain) => (
      chain.chain !== chains.arcBridgeChain.chain
      && chain.cctp.forwarderSupported.destination
    ))).to.equal(true);
    expect(chains.bridgeDestinationsFor(chains.defaultBridgeCounterpart)).to.deep.equal([chains.arcBridgeChain]);
  });

  it('expires estimates at thirty seconds and keeps a twenty-percent Arc gas buffer', function () {
    expect(bridge.isFreshBridgeEstimate(10_000, 39_999)).to.equal(true);
    expect(bridge.isFreshBridgeEstimate(10_000, 40_000)).to.equal(false);
    expect(bridge.bufferedBridgeGas(100_000n)).to.equal(120_000n);
    expect(bridge.arcNativeGasWeiToTokenUnits(100_000_000_000_001n)).to.equal(101n);
    expect(bridge.arcBridgeMaxBalance(10_000_000n, 100_000n)).to.equal(9_880_000n);
  });

  it('accepts both SDK integer gas units and decimal native gas amounts without crashing', function () {
    expect(bridge.bridgeGasFeeToNativeUnits('1412500000000000', 18)).to.equal(1412500000000000n);
    expect(bridge.bridgeGasFeeToNativeUnits('0.0014125', 18)).to.equal(1412500000000000n);
    expect(bridge.bridgeGasFeeToNativeUnits('0.0000001', 6)).to.equal(1n);
    expect(bridge.bridgeGasFeeToNativeUnits('not-a-fee', 18)).to.equal(null);
  });

  it('keeps browser RPC traffic on a whitelisted same-origin proxy', function () {
    expect(rpcProxy.rpcProxyPath(5042002)).to.equal('/api/rpc/5042002');
    expect(rpcProxy.isSafeJsonRpcPayload({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [],
    })).to.equal(true);
    expect(rpcProxy.isSafeJsonRpcPayload({
      jsonrpc: '2.0',
      id: 1,
      method: 'debug_traceTransaction',
      params: [],
    })).to.equal(false);
  });

  it('classifies route, wallet, gas, rate-limit, forwarder and partial failures', function () {
    expect(bridge.bridgeErrorKind(new Error('User rejected request'))).to.equal('rejected');
    expect(bridge.bridgeErrorKind(new Error('WRONG_SOURCE_CHAIN'))).to.equal('wrong-source-chain');
    expect(bridge.bridgeErrorKind(new Error('WALLET_ACCOUNT_MISMATCH'))).to.equal('wallet-provider');
    expect(bridge.bridgeErrorKind(new Error('unsupported route'))).to.equal('unsupported-route');
    expect(bridge.bridgeErrorKind(new Error('insufficient USDC balance'))).to.equal('insufficient-usdc');
    expect(bridge.bridgeErrorKind(new Error('insufficient funds for gas'))).to.equal('insufficient-gas');
    expect(bridge.bridgeErrorKind({ cause: { message: '429 too many requests' } })).to.equal('rate-limited');
    expect(bridge.bridgeErrorKind(new Error('Forwarder attestation failed'))).to.equal('forwarder');
    expect(bridge.bridgeErrorKind(new Error('burn success but mint failed - partial'))).to.equal('partial');
  });

  it('accepts an intact account-scoped mock estimate and rejects mutations', function () {
    const source = chains.arcBridgeChain;
    const destination = chains.defaultBridgeCounterpart;
    const estimate = {
      token: 'USDC',
      amount: '1.25',
      source: { address: account, chain: source.chain },
      destination: {
        address: account,
        recipientAddress: account,
        chain: destination.chain,
      },
      gasFees: [],
      fees: [
        { type: 'provider', token: 'USDC', amount: '0.01' },
        { type: 'forwarder', token: 'USDC', amount: '0.02' },
      ],
    };
    expect(() => bridge.assertBridgeEstimateIntegrity(estimate, {
      account,
      amount: '1.25',
      source,
      destination,
    })).not.to.throw();
    expect(bridge.formatBridgeFeeTotal(estimate.fees)).to.equal('0.03');
    expect(() => bridge.assertBridgeEstimateIntegrity(
      { ...estimate, amount: '2' },
      { account, amount: '1.25', source, destination },
    )).to.throw('BRIDGE_ESTIMATE_AMOUNT_MISMATCH');
  });
});
