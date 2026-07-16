const { expect } = require('chai');
const fs = require('fs');
const Module = require('module');
const path = require('path');
const ts = require('typescript');

function loadRpcModule() {
  const filename = path.join(__dirname, '..', 'lib', 'rpc.ts');
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

describe('RPC resilience', function () {
  const rpc = loadRpcModule();

  it('retries rate-limited operations with exponential backoff', async function () {
    let attempts = 0;
    const delays = [];
    const result = await rpc.withRpcRetry(async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error('RPC Request failed.');
        error.details = 'request limit reached';
        throw error;
      }
      return 'ok';
    }, {
      retries: 4,
      baseDelayMs: 100,
      sleep: async (delay) => delays.push(delay),
    });

    expect(result).to.equal('ok');
    expect(attempts).to.equal(3);
    expect(delays).to.deep.equal([100, 200]);
  });

  it('does not retry contract or validation failures', async function () {
    let attempts = 0;
    let caught;
    try {
      await rpc.withRpcRetry(async () => {
        attempts += 1;
        throw new Error('MEMBER_KEY_REQUIRED');
      }, { retries: 4, sleep: async () => undefined });
    } catch (error) {
      caught = error;
    }

    expect(attempts).to.equal(1);
    expect(caught.message).to.equal('MEMBER_KEY_REQUIRED');
  });

  it('turns verbose provider errors into a localized rate-limit message', function () {
    const error = {
      shortMessage: 'RPC Request failed.',
      message: 'RPC Request failed. Request Arguments: very long payload',
      cause: { details: 'request limit reached' },
    };

    expect(rpc.readableRpcError(error, 'fallback', 'Arc RPC is busy.')).to.equal('Arc RPC is busy.');
  });
});
