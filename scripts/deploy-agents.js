const hre = require('hardhat');

async function main() {
  const Agents = await hre.ethers.getContractFactory('ArcanumAgents');
  const agents = await Agents.deploy();

  await agents.waitForDeployment();

  const address = await agents.getAddress();
  const feeClaimWallet = await agents.FEE_CLAIM_WALLET();

  console.log(`ArcanumAgents deployed to ${address}`);
  console.log(`Fee claim wallet: ${feeClaimWallet}`);
  console.log(`Set NEXT_PUBLIC_AGENT_CONTRACT_ADDRESS=${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
