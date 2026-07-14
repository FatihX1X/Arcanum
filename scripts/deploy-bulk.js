const hre = require('hardhat');

async function main() {
  const BulkSender = await hre.ethers.getContractFactory('ArcanumBulkSender');
  const bulkSender = await BulkSender.deploy();
  await bulkSender.waitForDeployment();

  const address = await bulkSender.getAddress();
  const receipt = await bulkSender.deploymentTransaction().wait();
  console.log(`ArcanumBulkSender deployed to ${address}`);
  console.log(`Deployment block: ${receipt.blockNumber}`);
  console.log(`Set NEXT_PUBLIC_BULK_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
