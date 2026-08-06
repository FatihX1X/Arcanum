const { strict: assert } = require('node:assert');
const { test } = require('node:test');
const { createRunner, findWalletAddress, parseCircleJson } = require('../scripts/arcanum-agent-lib');

const wallet = '0x1111111111111111111111111111111111111111';
const recipient = '0x2222222222222222222222222222222222222222';
const payer = '0x3333333333333333333333333333333333333333';
const provider = '0x4444444444444444444444444444444444444444';

function runnerFixture({ proposal, balance = 1000000000000000000n, confirm = async () => false } = {}) {
  const calls = [];
  const client = {
    getBalance: async () => balance,
    readContract: async ({ functionName, args }) => {
      if (functionName === 'getAgent') return { registeredAt: 0n, isActive: false };
      if (functionName === 'isActiveAgent') return true;
      if (functionName === 'PUBLIC_MESSAGE_FEE') return 10000000000000000n;
      if (functionName === 'getProposal') return proposal;
      if (functionName === 'getConversation') return { creator: wallet, counterparty: recipient };
      throw new Error(`Unexpected read ${functionName} ${args}`);
    },
  };
  const runCircle = async (args) => {
    calls.push(args);
    if (args[0] === 'wallet' && args[1] === 'list') return JSON.stringify([{ address: wallet }]);
    return JSON.stringify({ ok: true });
  };
  return { calls, runner: createRunner({ client, runCircle, confirm }) };
}

test('parses Circle JSON and finds an agent wallet address', () => {
  assert.deepEqual(parseCircleJson('notice\n[{"walletAddress":"0x1111111111111111111111111111111111111111"}]'), [{ walletAddress: wallet }]);
  assert.equal(findWalletAddress({ result: [{ walletAddress: wallet }] }), wallet);
});

test('sends only public messages with fee plus optional payment', async () => {
  const { runner, calls } = runnerFixture();
  await runner.sendPublicMessage({ recipient, message: 'public hello', amount: '1.25' });
  const execute = calls.at(-1);
  assert.deepEqual(execute.slice(0, 6), ['wallet', 'execute', 'sendAgentMessage(address,string,bool,uint256)', recipient, 'public hello', 'false']);
  assert.ok(execute.includes('1.26'));
  await assert.rejects(() => runner.sendPublicMessage({ recipient, message: 'secret', privateMessage: true }), /Private messages/);
});

test('does not execute an escrow fund without FUND confirmation', async () => {
  const proposal = { conversationId: 7n, proposer: recipient, payer: wallet, provider, arbiter: recipient, amount: 500000000000000000n, status: 1 };
  const { runner, calls } = runnerFixture({ proposal, confirm: async () => false });
  const result = await runner.fundEscrow({ proposalId: '9' });
  assert.equal(result.cancelled, true);
  assert.equal(calls.some((args) => args.includes('fundProposal(uint256)')), false);
});

test('rejects escrow funding when the Circle wallet is not payer', async () => {
  const proposal = { conversationId: 7n, proposer: recipient, payer, provider, arbiter: recipient, amount: 500000000000000000n, status: 1 };
  const { runner } = runnerFixture({ proposal });
  await assert.rejects(() => runner.fundEscrow({ proposalId: '9' }), /Only the proposal payer/);
});
