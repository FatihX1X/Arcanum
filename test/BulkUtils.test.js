const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

function loadBulkUtils() {
  const filename = path.join(__dirname, '..', 'lib', 'bulkUtils.ts');
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

function expectThrows(action, message) {
  expect(action).to.throw(message);
}

describe('bulk sender frontend validation', function () {
  const sender = '0x1111111111111111111111111111111111111111';
  const recipientA = '0x2222222222222222222222222222222222222222';
  const recipientB = '0x3333333333333333333333333333333333333333';

  it('parses comma, semicolon, and whitespace paste rows', function () {
    const { parseBulkPaste } = loadBulkUtils();
    expect(parseBulkPaste(`${recipientA},12.50\n${recipientB};2`)).to.deep.equal([
      { recipient: recipientA, amount: '12.50' },
      { recipient: recipientB, amount: '2' },
    ]);
  });

  it('sorts recipients with their amounts and computes a 6-decimal total', function () {
    const { prepareBulkRows } = loadBulkUtils();
    const result = prepareBulkRows([
      { recipient: recipientB, amount: '2.000001' },
      { recipient: recipientA, amount: '12.50' },
    ], sender);

    expect(result.recipients).to.deep.equal([recipientA, recipientB]);
    expect(result.amounts).to.deep.equal([12500000n, 2000001n]);
    expect(result.totalAmount).to.equal(14500001n);
  });

  it('rejects duplicate and self recipients', function () {
    const { prepareBulkRows } = loadBulkUtils();
    expectThrows(() => prepareBulkRows([
      { recipient: recipientA, amount: '1' },
      { recipient: recipientA, amount: '2' },
    ], sender), 'BULK_RECIPIENT_DUPLICATE');
    expectThrows(() => prepareBulkRows([{ recipient: sender, amount: '1' }], sender), 'BULK_RECIPIENT_SELF');
  });

  it('rejects invalid addresses and amounts with more than 6 decimals', function () {
    const { prepareBulkRows } = loadBulkUtils();
    expectThrows(() => prepareBulkRows([{ recipient: 'not-an-address', amount: '1' }], sender), 'BULK_RECIPIENT_INVALID');
    expectThrows(() => prepareBulkRows([{ recipient: recipientA, amount: '1.0000001' }], sender), 'BULK_AMOUNT_INVALID');
    expectThrows(() => prepareBulkRows([{ recipient: recipientA, amount: '0' }], sender), 'BULK_AMOUNT_INVALID');
  });
});
