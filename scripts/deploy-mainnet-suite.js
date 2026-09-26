const hre = require('hardhat');

async function deployContract(name, args = []) {
  const Factory = await hre.ethers.getContractFactory(name);
  const contract = await Factory.deploy(...args);
  const deploymentTx = contract.deploymentTransaction();
  console.log(`${name} deployment tx: ${deploymentTx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  const receipt = await deploymentTx.wait();

  console.log(`${name} deployed to ${address}`);
  console.log(`${name} deployment block: ${receipt.blockNumber}`);

  return { address, blockNumber: receipt.blockNumber };
}

async function main() {
  const network = await hre.ethers.provider.getNetwork();
  if (network.chainId !== 5042n) {
    throw new Error(`Expected Arc mainnet chainId 5042, got ${network.chainId.toString()}`);
  }

  const [deployer] = await hre.ethers.getSigners();
  const balance = await hre.ethers.provider.getBalance(deployer.address);

  console.log(`Network: ${hre.network.name} (${network.chainId.toString()})`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Native USDC balance: ${hre.ethers.formatEther(balance)}`);

  const existingMessenger = process.env.ARC_MAINNET_MESSENGER_ADDRESS;
  const messenger = existingMessenger
    ? { address: existingMessenger, blockNumber: Number(process.env.ARC_MAINNET_MESSENGER_BLOCK || 0) }
    : await deployContract('ArcanumMessenger');
  if (existingMessenger) {
    const code = await hre.ethers.provider.getCode(existingMessenger);
    if (code === '0x') throw new Error(`No contract code at ARC_MAINNET_MESSENGER_ADDRESS ${existingMessenger}`);
    console.log(`ArcanumMessenger reused at ${existingMessenger}`);
  }
  const agents = await deployContract('ArcanumAgents');
  const groups = await deployContract('ArcanumGroups', [messenger.address]);
  const bulkSender = await deployContract('ArcanumBulkSender');
  const gigBoard = await deployContract('ArcanumGigBoard');
  const escrow = await deployContract('ArcanumEscrow', [gigBoard.address]);

  console.log('Deployment summary:');
  console.log(JSON.stringify({
    chainId: Number(network.chainId),
    messenger,
    agents,
    groups,
    bulkSender,
    gigBoard,
    escrow,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
