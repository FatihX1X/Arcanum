// Read-only: checks executable bytecode and dependency wiring, never signs.
const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

const contracts = {
  messenger: 'ArcanumMessenger', agents: 'ArcanumAgents', groups: 'ArcanumGroups',
  bulkSender: 'ArcanumBulkSender', gigBoard: 'ArcanumGigBoard', escrow: 'ArcanumEscrow',
};

function executable(code) {
  const bytes = Buffer.from(code.replace(/^0x/, ''), 'hex');
  if (bytes.length < 2) throw new Error('Missing runtime bytecode');
  const metadataLength = bytes.readUInt16BE(bytes.length - 2);
  if (metadataLength + 2 >= bytes.length) throw new Error('Invalid Solidity metadata');
  return bytes.subarray(0, bytes.length - metadataLength - 2);
}

async function verifyCode(provider, artifacts, name, address, blockTag = 'latest') {
  const artifact = await artifacts.readArtifact(name);
  const info = await artifacts.getBuildInfo(`${artifact.sourceName}:${name}`);
  if (!info) throw new Error(`Missing compiler build info for ${name}`);
  const compiled = info.output.contracts[artifact.sourceName][name].evm.deployedBytecode;
  const code = await provider.getCode(address, blockTag);
  if (code === '0x') throw new Error(`Missing ${name} at ${address}`);
  const actual = executable(code);
  const expected = executable(`0x${compiled.object}`);
  // Immutable addresses are compiler-patched; verify their getters separately.
  for (const positions of Object.values(compiled.immutableReferences || {})) {
    for (const { start, length } of positions) {
      actual.fill(0, start, start + length);
      expected.fill(0, start, start + length);
    }
  }
  if (!actual.equals(expected)) throw new Error(`Executable bytecode mismatch: ${name} ${address}`);
  return { runtimeBytes: (code.length - 2) / 2, codeHash: hre.ethers.keccak256(code), executableMatches: true };
}

async function audit(provider, deployments, artifacts = hre.artifacts) {
  const chainId = Number((await provider.getNetwork()).chainId);
  if (chainId !== 5042 || deployments.chainId !== 5042) throw new Error('Expected Arc mainnet (5042)');
  const blockNumber = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNumber);
  const report = { chainId, blockNumber, blockHash: block.hash, checkedAt: new Date().toISOString(), contracts: {} };
  const instances = {};
  for (const [key, name] of Object.entries(contracts)) {
    const address = deployments[key].address;
    const check = await verifyCode(provider, artifacts, name, address, blockNumber);
    instances[key] = new hre.ethers.Contract(address, (await artifacts.readArtifact(name)).abi, provider);
    report.contracts[key] = { address, ...check, balanceWei: String(await provider.getBalance(address, blockNumber)) };
  }
  const expectedLinks = [
    ['groups', 'KEY_REGISTRY', deployments.messenger.address],
    ['gigBoard', 'escrowContract', deployments.escrow.address],
    ['gigBoard', 'CONFIGURATOR', deployments.deployer],
    ['escrow', 'GIG_BOARD', deployments.gigBoard.address],
  ];
  for (const [key, getter, expected] of expectedLinks) {
    const actual = await instances[key][getter]({ blockTag: blockNumber });
    if (actual.toLowerCase() !== expected.toLowerCase()) throw new Error(`${key}.${getter} mismatch`);
    report.contracts[key][getter] = actual;
  }
  for (const key of ['messenger', 'agents', 'groups']) {
    const wallet = await instances[key].FEE_CLAIM_WALLET({ blockTag: blockNumber });
    if (wallet.toLowerCase() !== deployments.deployer.toLowerCase()) throw new Error(`${key}: unexpected fee wallet`);
    if (!await instances[key].feeClaimWhitelist(wallet, { blockTag: blockNumber })) throw new Error(`${key}: fee wallet not enabled`);
    report.contracts[key].feeWallet = wallet;
  }
  for (const [key, getter] of [['messenger', 'messageCount'], ['agents', 'messageCount'], ['bulkSender', 'batchCount'], ['gigBoard', 'gigCount'], ['escrow', 'escrowCount']]) {
    report.contracts[key][getter] = String(await instances[key][getter]({ blockTag: blockNumber }));
  }
  return report;
}

async function main() {
  const deployments = require('../deployments/arcMainnet.json');
  const provider = new hre.ethers.JsonRpcProvider(process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io');
  try {
    const report = await audit(provider, deployments);
    const destination = path.join(__dirname, '..', 'reports', 'mainnet-contract-audit.json');
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report, null, 2));
  } finally { provider.destroy(); }
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { audit, verifyCode, executable, contracts };
