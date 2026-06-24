const hre = require('hardhat');

async function main() {
  const treasury = process.env.TREASURY_ADDRESS;

  if (!treasury) {
    throw new Error('TREASURY_ADDRESS is required');
  }

  const Messenger = await hre.ethers.getContractFactory('ArcanumMessenger');
  const messenger = await Messenger.deploy(treasury);

  await messenger.waitForDeployment();

  const address = await messenger.getAddress();
  console.log(`ArcanumMessenger deployed to ${address}`);
  console.log(`Treasury address: ${treasury}`);
  console.log(`Set NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
