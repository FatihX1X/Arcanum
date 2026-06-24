const hre = require('hardhat');

async function main() {
  const address = process.env.CONTRACT_ADDRESS || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;

  if (!address) {
    throw new Error('CONTRACT_ADDRESS or NEXT_PUBLIC_CONTRACT_ADDRESS is required');
  }

  const [signer] = await hre.ethers.getSigners();
  const signerAddress = await signer.getAddress();
  const messenger = await hre.ethers.getContractAt('ArcanumMessenger', address, signer);
  const feeClaimWallet = await messenger.FEE_CLAIM_WALLET();
  const whitelisted = await messenger.feeClaimWhitelist(signerAddress);
  const balance = await hre.ethers.provider.getBalance(address);

  if (signerAddress.toLowerCase() !== feeClaimWallet.toLowerCase() || !whitelisted) {
    throw new Error(`Signer ${signerAddress} is not allowed to claim fees`);
  }

  if (balance === 0n) {
    throw new Error('NO_FEES');
  }

  console.log(`Contract: ${address}`);
  console.log(`Claimer: ${signerAddress}`);
  console.log(`Claiming native USDC: ${hre.ethers.formatEther(balance)}`);

  const tx = await messenger.claim_fees();
  console.log(`Claim tx: ${tx.hash}`);
  await tx.wait();
  console.log('Fees claimed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
