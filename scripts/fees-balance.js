const hre = require('hardhat');

async function main() {
  const address = process.env.CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!address) {
    throw new Error('CONTRACT_ADDRESS or NEXT_PUBLIC_CONTRACT_ADDRESS is required');
  }

  const messenger = await hre.ethers.getContractAt('ArcanumMessenger', address);
  const feeClaimWallet = await messenger.FEE_CLAIM_WALLET();
  const balance = await hre.ethers.provider.getBalance(address);

  console.log(`Contract: ${address}`);
  console.log(`Fee claim wallet: ${feeClaimWallet}`);
  console.log(`Claimable native USDC: ${hre.ethers.formatEther(balance)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
