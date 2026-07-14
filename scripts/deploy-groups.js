const hre = require('hardhat');

async function main() {
  const keyRegistry = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || '0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB';
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
