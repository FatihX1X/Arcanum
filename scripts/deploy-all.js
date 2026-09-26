const fs = require('fs');
const path = require('path');
const hre = require('hardhat');

async function deploy(name, ...args) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const receipt = await contract.deploymentTransaction().wait();
  console.log(`${name} deployed to ${address} (block ${receipt.blockNumber})`);
  return { contract, address, blockNumber: receipt.blockNumber };
}

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  if (!deployer) {
    throw new Error('DEPLOYER_PRIVATE_KEY is required');
  }

  const network = await hre.ethers.provider.getNetwork();
  const chainId = Number(network.chainId);
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Deploying Arcanum suite to ${hre.network.name} (chain ${chainId})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance: ${hre.ethers.formatEther(balance)} USDC`);

  const messenger = await deploy('ArcanumMessenger');
  const agents = await deploy('ArcanumAgents');
  const groups = await deploy('ArcanumGroups', messenger.address);
  const bulkSender = await deploy('ArcanumBulkSender');
  const gigBoard = await deploy('ArcanumGigBoard');
  const escrow = await deploy('ArcanumEscrow', gigBoard.address);

  const configureTx = await gigBoard.contract.configureEscrow(escrow.address);
  const configureReceipt = await configureTx.wait();
  console.log(`Gig Board escrow binding: ${await gigBoard.contract.escrowContract()} (tx ${configureReceipt.hash})`);

  const deployments = {
    chainId,
    network: hre.network.name,
    deployer: deployer.address,
    messenger: { address: messenger.address, blockNumber: messenger.blockNumber },
    agents: { address: agents.address, blockNumber: agents.blockNumber },
    groups: { address: groups.address, blockNumber: groups.blockNumber },
    bulkSender: { address: bulkSender.address, blockNumber: bulkSender.blockNumber },
    gigBoard: { address: gigBoard.address, blockNumber: gigBoard.blockNumber },
    escrow: { address: escrow.address, blockNumber: escrow.blockNumber },
  };

  const outDir = path.join(__dirname, '..', 'deployments');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${hre.network.name}.json`);
  fs.writeFileSync(outFile, `${JSON.stringify(deployments, null, 2)}\n`);

  console.log(`Wrote ${outFile}`);
  console.log('');
  console.log('Set these env overrides after deploy:');
  console.log(`NEXT_PUBLIC_CHAIN_ID=${chainId}`);
  console.log(`NEXT_PUBLIC_CONTRACT_ADDRESS=${messenger.address}`);
  console.log(`NEXT_PUBLIC_AGENT_CONTRACT_ADDRESS=${agents.address}`);
  console.log(`NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS=${groups.address}`);
  console.log(`NEXT_PUBLIC_BULK_CONTRACT_ADDRESS=${bulkSender.address}`);
  console.log(`NEXT_PUBLIC_GIG_BOARD_CONTRACT_ADDRESS=${gigBoard.address}`);
  console.log(`NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrow.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
