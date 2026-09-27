const fs = require('fs');
const path = require('path');

async function deploymentContext(hre) {
  const expected = { arcMainnet: 5042, arcTestnet: 5042002, hardhat: 31337, localhost: 31337 }[hre.network.name];
  const actual = Number((await hre.ethers.provider.getNetwork()).chainId);
  if (!expected || expected !== actual) throw new Error(`Unexpected deployment network: ${hre.network.name} / ${actual}`);
  const file = path.join(__dirname, '..', 'deployments', `${hre.network.name}.json`);
  const manifest = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (manifest && manifest.chainId !== actual) throw new Error('Deployment manifest chain mismatch');
  return { chainId: actual, manifest };
}

async function requireMissing(hre, keys) {
  const context = await deploymentContext(hre);
  for (const key of keys) {
    const entry = context.manifest?.[key];
    if (!entry) continue;
    const code = await hre.ethers.provider.getCode(entry.address);
    if (code !== '0x') throw new Error(`${key} already deployed at ${entry.address}; refusing duplicate deployment`);
    throw new Error(`${key} is recorded at ${entry.address} but has no code; investigate before deploying`);
  }
  return context;
}

async function groupRegistry(hre) {
  const { manifest } = await deploymentContext(hre);
  const address = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || manifest?.messenger?.address;
  if (!address || !hre.ethers.isAddress(address)) throw new Error('A valid Messenger address on the selected chain is required');
  const { verifyCode } = require('./audit-mainnet');
  await verifyCode(hre.ethers.provider, hre.artifacts, 'ArcanumMessenger', address);
  return address;
}

module.exports = { deploymentContext, requireMissing, groupRegistry };
