const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync, writeFileSync, mkdirSync } = require('node:fs');
const { homedir } = require('node:os');
const { dirname, resolve } = require('node:path');
const { createPublicClient, formatEther, getAddress, http, isAddress, parseEther } = require('viem');

const ARC = {
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } },
};
const ARC_TESTNET = ARC;

const DEFAULTS = {
  rpcUrl: 'https://rpc.mainnet.arc.io',
  agentsAddress: '0x2AB26Cf3216852c89BcEea8AAd16e2b96E628108',
  gigBoardAddress: '0xE238054755B41cA6bDe7C848F9b3e92BCEE22b4A',
  escrowAddress: '0xf9DD777185da559aDadbf298092DE7e6A050a93E',
};

const agentsAbi = [
  { type: 'function', name: 'getAgent', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'tuple', components: [{ name: 'agentAddress', type: 'address' }, { name: 'name', type: 'string' }, { name: 'description', type: 'string' }, { name: 'metadataURI', type: 'string' }, { name: 'registeredAt', type: 'uint256' }, { name: 'isActive', type: 'bool' }] }] },
  { type: 'function', name: 'isActiveAgent', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'PUBLIC_MESSAGE_FEE', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];

const gigBoardAbi = [
  { type: 'function', name: 'getProposal', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'conversationId', type: 'uint256' }, { name: 'proposer', type: 'address' }, { name: 'payer', type: 'address' }, { name: 'provider', type: 'address' }, { name: 'arbiter', type: 'address' }, { name: 'amount', type: 'uint256' }, { name: 'timeoutDays', type: 'uint8' }, { name: 'termsHash', type: 'bytes32' }, { name: 'createdAt', type: 'uint64' }, { name: 'status', type: 'uint8' }, { name: 'escrowId', type: 'uint256' }] }] },
  { type: 'function', name: 'getConversation', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'tuple', components: [{ name: 'id', type: 'uint256' }, { name: 'gigId', type: 'uint256' }, { name: 'creator', type: 'address' }, { name: 'counterparty', type: 'address' }, { name: 'createdAt', type: 'uint64' }, { name: 'messageCount', type: 'uint256' }, { name: 'activeProposalId', type: 'uint256' }, { name: 'hasActiveProposal', type: 'bool' }] }] },
];

function configPath() {
  return resolve(homedir(), '.arcanum-agent', 'config.json');
}

function readConfig(path = configPath()) {
  if (!existsSync(path)) return { ...DEFAULTS };
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return { ...DEFAULTS, ...value };
  } catch (error) {
    throw new Error(`Could not read Arcanum agent config at ${path}: ${error.message}`);
  }
}

function writeConfig(value, path = configPath()) {
  const definedValues = Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
  const config = { ...DEFAULTS, ...definedValues };
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return config;
}

function parseCircleJson(output) {
  const text = String(output || '').trim();
  const start = Math.max(text.lastIndexOf('\n{'), text.lastIndexOf('\n['), text.startsWith('{') ? 0 : -1, text.startsWith('[') ? 0 : -1);
  const candidate = start >= 0 ? text.slice(start).trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    throw new Error('Circle CLI did not return JSON. Ensure Circle CLI supports --output json.');
  }
}

function findWalletAddress(value) {
  if (typeof value === 'string' && isAddress(value)) return getAddress(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      const address = findWalletAddress(item);
      if (address) return address;
    }
  }
  if (value && typeof value === 'object') {
    for (const key of ['address', 'walletAddress', 'blockchainAddress']) {
      if (typeof value[key] === 'string' && isAddress(value[key])) return getAddress(value[key]);
    }
    for (const child of Object.values(value)) {
      const address = findWalletAddress(child);
      if (address) return address;
    }
  }
  return undefined;
}

function sameAddress(a, b) {
  return getAddress(a).toLowerCase() === getAddress(b).toLowerCase();
}

function toUint(value, label) {
  if (!/^\d+$/.test(String(value))) throw new Error(`${label} must be a non-negative integer.`);
  return BigInt(value);
}

function createRunner({ config = readConfig(), runCircle, client, confirm } = {}) {
  const publicClient = client || createPublicClient({ chain: ARC, transport: http(config.rpcUrl) });
  const executeCircle = runCircle || ((args) => execFileSync('circle', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));

  async function circle(args) {
    try {
      return await executeCircle(args);
    } catch (error) {
      const detail = error.stderr ? String(error.stderr).trim() : error.message;
      throw new Error(`Circle CLI failed: ${detail}`);
    }
  }

  async function walletAddress() {
    await circle(['wallet', 'status', '--type', 'agent', '--output', 'json']);
    const wallets = parseCircleJson(await circle(['wallet', 'list', '--chain', 'ARC-TESTNET', '--type', 'agent', '--output', 'json']));
    const address = findWalletAddress(wallets);
    if (!address) throw new Error('No Circle Agent Wallet was found for ARC-TESTNET. Log in and create or fund an agent wallet first.');
    return address;
  }

  async function read(address, abi, functionName, args = []) {
    return publicClient.readContract({ address, abi, functionName, args });
  }

  async function execute({ contract, signature, params = [], value = 0n, address }) {
    return circle([
      'wallet', 'execute', signature, ...params.map(String), '--contract', contract, '--address', address,
      '--chain', 'ARC-TESTNET', '--amount', formatEther(value), '--output', 'json',
    ]);
  }

  async function status() {
    const address = await walletAddress();
    const [agent, balance] = await Promise.all([
      read(config.agentsAddress, agentsAbi, 'getAgent', [address]),
      publicClient.getBalance({ address }),
    ]);
    return { address, balance, registered: agent.registeredAt > 0n, active: agent.isActive, profile: agent };
  }

  async function register({ name, description = '', metadataURI = '' }) {
    const address = await walletAddress();
    const current = await read(config.agentsAddress, agentsAbi, 'getAgent', [address]);
    if (current.registeredAt > 0n) return { skipped: true, address, profile: current };
    if (!name || !name.trim()) throw new Error('Agent name is required.');
    const transaction = await execute({
      contract: config.agentsAddress,
      signature: 'registerAgent(string,string,string)',
      params: [name.trim(), description.trim(), metadataURI.trim()],
      address,
    });
    return { skipped: false, address, transaction };
  }

  async function setActive(isActive) {
    const address = await walletAddress();
    const current = await read(config.agentsAddress, agentsAbi, 'getAgent', [address]);
    if (current.registeredAt === 0n) throw new Error('Register this Circle Agent Wallet in Arcanum before changing its status.');
    if (current.isActive === isActive) return { skipped: true, address, active: isActive };
    const transaction = await execute({ contract: config.agentsAddress, signature: 'setAgentActive(bool)', params: [isActive], address });
    return { skipped: false, address, transaction };
  }

  async function sendPublicMessage({ recipient, message, amount = '0', privateMessage = false }) {
    if (privateMessage) throw new Error('Private messages are not supported by the Circle agent runner.');
    if (!isAddress(recipient)) throw new Error('Recipient must be a valid EVM address.');
    if (!message || !message.trim()) throw new Error('Message is required.');
    if (Buffer.byteLength(message, 'utf8') > 4096) throw new Error('Message exceeds the contract payload limit of 4096 bytes.');
    const address = await walletAddress();
    const target = getAddress(recipient);
    if (sameAddress(address, target)) throw new Error('An agent cannot message itself.');
    const [senderActive, recipientActive, fee] = await Promise.all([
      read(config.agentsAddress, agentsAbi, 'isActiveAgent', [address]),
      read(config.agentsAddress, agentsAbi, 'isActiveAgent', [target]),
      read(config.agentsAddress, agentsAbi, 'PUBLIC_MESSAGE_FEE'),
    ]);
    if (!senderActive) throw new Error('This Circle Agent Wallet is not an active Arcanum agent.');
    if (!recipientActive) throw new Error('Recipient is not an active Arcanum agent.');
    let payment;
    try {
      payment = parseEther(amount);
    } catch {
      throw new Error('Amount must be a valid non-negative USDC value.');
    }
    if (payment < 0n) throw new Error('Amount must be a non-negative USDC value.');
    const transaction = await execute({
      contract: config.agentsAddress,
      signature: 'sendAgentMessage(address,string,bool,uint256)',
      params: [target, message.trim(), false, payment],
      value: fee + payment,
      address,
    });
    return { address, recipient: target, fee, payment, transaction };
  }

  async function proposalFor(address, proposalId) {
    const proposal = await read(config.gigBoardAddress, gigBoardAbi, 'getProposal', [proposalId]);
    const conversation = await read(config.gigBoardAddress, gigBoardAbi, 'getConversation', [proposal.conversationId]);
    if (!sameAddress(address, conversation.creator) && !sameAddress(address, conversation.counterparty)) {
      throw new Error('This Circle Agent Wallet is not a participant in the proposal conversation.');
    }
    return { proposal, conversation };
  }

  async function acceptEscrow({ proposalId }) {
    const id = toUint(proposalId, 'Proposal ID');
    const address = await walletAddress();
    const { proposal } = await proposalFor(address, id);
    if (proposal.status !== 0) throw new Error('Only pending proposals can be accepted.');
    if (sameAddress(address, proposal.proposer)) throw new Error('The proposal author cannot accept its own proposal.');
    const transaction = await execute({ contract: config.gigBoardAddress, signature: 'acceptProposal(uint256)', params: [id], address });
    return { address, proposal, transaction };
  }

  async function fundEscrow({ proposalId, approve = false }) {
    const id = toUint(proposalId, 'Proposal ID');
    const address = await walletAddress();
    const { proposal } = await proposalFor(address, id);
    if (proposal.status !== 1) throw new Error('Only accepted proposals can be funded.');
    if (!sameAddress(address, proposal.payer)) throw new Error('Only the proposal payer can fund this escrow.');
    const balance = await publicClient.getBalance({ address });
    if (balance < proposal.amount) throw new Error(`Insufficient Arc USDC. Required: ${formatEther(proposal.amount)} USDC.`);
    const summary = { proposalId: id, payer: proposal.payer, provider: proposal.provider, arbiter: proposal.arbiter, amount: proposal.amount };
    const accepted = approve || (confirm ? await confirm(summary) : false);
    if (!accepted) return { cancelled: true, address, ...summary };
    const transaction = await execute({ contract: config.escrowAddress, signature: 'fundProposal(uint256)', params: [id], value: proposal.amount, address });
    return { cancelled: false, address, ...summary, transaction };
  }

  return { config, status, register, setActive, sendPublicMessage, acceptEscrow, fundEscrow };
}

module.exports = { ARC, ARC_TESTNET, DEFAULTS, configPath, readConfig, writeConfig, parseCircleJson, findWalletAddress, createRunner };
