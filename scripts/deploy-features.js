const hre = require('hardhat');

const DEFAULT_MESSENGER = '0x5b713DB5623d640a2E6c6eA0f002F229191E5DBB';
const DEFAULT_ARC_USDC = '0x3600000000000000000000000000000000000000';

async function main() {
  const messengerAddress = process.env.ARCANUM_MESSENGER_ADDRESS || process.env.NEXT_PUBLIC_CONTRACT_ADDRESS || DEFAULT_MESSENGER;
  const usdcAddress = process.env.ARC_USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS || DEFAULT_ARC_USDC;

  if (!hre.ethers.isAddress(messengerAddress) || messengerAddress === hre.ethers.ZeroAddress) {
    throw new Error('A valid ARCANUM_MESSENGER_ADDRESS is required');
  }
  if (!hre.ethers.isAddress(usdcAddress) || usdcAddress === hre.ethers.ZeroAddress) {
    throw new Error('A valid ARC_USDC_ADDRESS is required');
  }

  const Group = await hre.ethers.getContractFactory('ArcanumGroup');
  const group = await Group.deploy(messengerAddress);
  await group.waitForDeployment();

  const Bulk = await hre.ethers.getContractFactory('ArcanumBulk');
  const bulk = await Bulk.deploy(usdcAddress);
  await bulk.waitForDeployment();

  console.log(`ArcanumGroup deployed to ${await group.getAddress()}`);
  console.log(`ArcanumBulk deployed to ${await bulk.getAddress()}`);
  console.log(`Messenger key registry: ${messengerAddress}`);
  console.log(`Arc USDC ERC-20 interface: ${usdcAddress}`);
  console.log(`Set NEXT_PUBLIC_GROUP_CONTRACT_ADDRESS=${await group.getAddress()}`);
  console.log(`Set NEXT_PUBLIC_BULK_CONTRACT_ADDRESS=${await bulk.getAddress()}`);
  console.log(`Set NEXT_PUBLIC_USDC_ADDRESS=${usdcAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
