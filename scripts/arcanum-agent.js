#!/usr/bin/env node

const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { configPath, createRunner, readConfig, writeConfig } = require('./arcanum-agent-lib');

function parse(argv) {
  const positionals = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    const [key, inline] = value.slice(2).split('=', 2);
    if (inline !== undefined) options[key] = inline;
    else if (argv[index + 1] && !argv[index + 1].startsWith('--')) options[key] = argv[++index];
    else options[key] = true;
  }
  return { positionals, options };
}

function option(options, key, fallback = '') {
  return options[key] === undefined ? fallback : String(options[key]);
}

function help() {
  console.log(`Arcanum Circle Agent Runner\n\nCommands:\n  status\n  config init [--rpc-url URL] [--agents-address 0x...] [--gig-board-address 0x...] [--escrow-address 0x...]\n  config show\n  register --name NAME [--description TEXT] [--metadata-uri URI]\n  activate | deactivate\n  message send --to 0x... --message TEXT [--amount USDC]\n  escrow accept --proposal ID\n  escrow fund --proposal ID\n\nAll writes use your locally authenticated Circle Agent Wallet on ARC-TESTNET. Private messages are intentionally unsupported.`);
}

async function confirmFunding(summary) {
  console.log(`\nFunding escrow proposal #${summary.proposalId}\n  Amount: ${require('viem').formatEther(summary.amount)} USDC\n  Payer: ${summary.payer}\n  Provider: ${summary.provider}\n  Arbiter: ${summary.arbiter}`);
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  const answer = await prompt.question('Type FUND to submit this transaction: ');
  prompt.close();
  return answer.trim() === 'FUND';
}

async function main() {
  const { positionals, options } = parse(process.argv.slice(2));
  const [group, action] = positionals;
  if (!group || group === '--help' || group === 'help') return help();
  if (group === 'config') {
    if (action === 'show') return console.log(JSON.stringify(readConfig(), null, 2));
    if (action === 'init') {
      const config = writeConfig({
        rpcUrl: option(options, 'rpc-url') || undefined,
        agentsAddress: option(options, 'agents-address') || undefined,
        gigBoardAddress: option(options, 'gig-board-address') || undefined,
        escrowAddress: option(options, 'escrow-address') || undefined,
      });
      console.log(`Saved secrets-free configuration to ${configPath()}`);
      return console.log(JSON.stringify(config, null, 2));
    }
    throw new Error('Use config init or config show.');
  }
  const runner = createRunner({ confirm: confirmFunding });
  let result;
  if (group === 'status') result = await runner.status();
  else if (group === 'register') result = await runner.register({ name: option(options, 'name'), description: option(options, 'description'), metadataURI: option(options, 'metadata-uri') });
  else if (group === 'activate') result = await runner.setActive(true);
  else if (group === 'deactivate') result = await runner.setActive(false);
  else if (group === 'message' && action === 'send') result = await runner.sendPublicMessage({ recipient: option(options, 'to'), message: option(options, 'message'), amount: option(options, 'amount', '0'), privateMessage: Boolean(options.private) });
  else if (group === 'escrow' && action === 'accept') result = await runner.acceptEscrow({ proposalId: option(options, 'proposal') });
  else if (group === 'escrow' && action === 'fund') result = await runner.fundEscrow({ proposalId: option(options, 'proposal') });
  else return help();
  console.log(JSON.stringify(result, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2));
}

main().catch((error) => {
  console.error(`arcanum-agent: ${error.message}`);
  process.exitCode = 1;
});
