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

function loadTypeScriptModule(relativePath, cache = new Map()) {
  const filename = path.join(__dirname, '..', relativePath);
  if (cache.has(filename)) return cache.get(filename);
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(filename, module);
  cache.set(filename, mod.exports);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  cache.set(filename, mod.exports);
  return mod.exports;
}

describe('Unified Arcanum history', function () {
  const history = loadTypeScriptModule('lib/history.ts');
  const account = '0x1111111111111111111111111111111111111111';
  const counterparty = '0x2222222222222222222222222222222222222222';
  const txHash = `0x${'a'.repeat(64)}`;

  it('sorts newest first and lets verified chain swaps replace local estimates', function () {
    const local = {
      id: 'local',
      kind: 'swap',
      timestamp: 100,
      status: 'pending',
      txHash,
      tokenIn: 'USDC',
      tokenOut: 'EURC',
      amountIn: '10',
      amountOut: '9',
      source: 'local',
    };
    const chain = { ...local, id: 'chain', timestamp: 200, status: 'confirmed', amountOut: '9.5', source: 'chain' };
    const result = history.sortAndDedupeHistory([local, chain]);
    expect(result).to.have.length(1);
    expect(result[0].source).to.equal('chain');
    expect(result[0].amountOut).to.equal('9.5');
  });

  it('filters message direction, category, addresses and public content', function () {
    const incoming = {
      id: 'message-1',
      kind: 'message',
      timestamp: 20,
      status: 'confirmed',
      channel: 'direct',
      direction: 'incoming',
      messageId: '1',
      sender: counterparty,
      recipient: account,
      payload: 'hello Arc',
      isPrivate: false,
    };
    const bulk = {
      id: 'bulk-1',
      kind: 'bulk',
      timestamp: 10,
      status: 'confirmed',
      batchId: '7',
      sender: account,
      totalAmount: '3',
      recipientCount: 1,
      recipients: [{ address: counterparty, amount: '3' }],
    };
    expect(history.filterHistory([bulk, incoming], 'incoming')).to.deep.equal([incoming]);
    expect(history.filterHistory([bulk, incoming], 'bulk')).to.deep.equal([bulk]);
    expect(history.filterHistory([bulk, incoming], 'all', 'hello')).to.deep.equal([incoming]);
    expect(history.filterHistory([bulk, incoming], 'all', counterparty)).to.have.length(2);
  });

  it('does not expose encrypted private payloads through search', function () {
    const item = {
      id: 'private-1',
      kind: 'message',
      timestamp: 1,
      status: 'confirmed',
      channel: 'agent',
      direction: 'outgoing',
      messageId: '4',
      sender: account,
      recipient: counterparty,
      payload: 'secret-ciphertext-marker',
      isPrivate: true,
    };
    expect(history.filterHistory([item], 'all', 'secret-ciphertext-marker')).to.deep.equal([]);
  });

  it('nets official USDC and EURC transfers by transaction hash', function () {
    const transfers = [
      {
        transaction_hash: txHash,
        timestamp: '2026-07-29T12:00:00.000Z',
        from: { hash: account },
        to: { hash: counterparty },
        total: { value: '10000000', decimals: '6' },
        token: { address_hash: '0x3600000000000000000000000000000000000000', symbol: 'USDC' },
      },
      {
        transaction_hash: txHash,
        timestamp: '2026-07-29T12:00:00.000Z',
        from: { hash: counterparty },
        to: { hash: account },
        total: { value: '9250000', decimals: '6' },
        token: { address_hash: '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a', symbol: 'EURC' },
      },
    ];
    const result = history.netArcSwapTransfers(transfers, account);
    expect(result).to.have.length(1);
    expect(result[0]).to.include({
      tokenIn: 'USDC',
      tokenOut: 'EURC',
      amountIn: '10',
      amountOut: '9.25',
      status: 'confirmed',
      source: 'chain',
    });
  });

  it('uses a versioned, chain and wallet scoped local storage key', function () {
    expect(history.swapHistoryStorageKey(5042002, account.toUpperCase()))
      .to.equal(`arcanum.history.v1:5042002:${account}`);
  });
});
