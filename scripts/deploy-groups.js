const hre = require('hardhat');

async function main() {
  await require('./deployment-safety').requireMissing(hre, ['groups']);
  const keyRegistry = await require('./deployment-safety').groupRegistry(hre);
  const Groups = await hre.ethers.getContractFactory('ArcanumGroups');
  const groups = await Groups.deploy(keyRegistry);
  await groups.waitForDeployment();

  const address = await groups.getAddress();
  const receipt = await groups.deploymentTransaction().wait();
  console.log(`ArcanumGroups deployed to ${address}`);
  console.log(`Deployment block: ${receipt.blockNumber}`);
  console.log(`Encryption key registry: ${await groups.KEY_REGISTRY()}`);
  console.log(`Set NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
