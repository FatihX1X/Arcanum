const hre = require('hardhat');

async function main() {
  const Messenger = await hre.ethers.getContractFactory('ArcanumMessenger');
  const messenger = await Messenger.deploy();

  await messenger.waitForDeployment();

  const address = await messenger.getAddress();
  console.log(`ArcanumMessenger deployed to ${address}`);
  console.log(`Set NEXT_PUBLIC_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
