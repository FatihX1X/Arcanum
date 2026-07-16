const hre = require('hardhat');

async function main() {
  const Board = await hre.ethers.getContractFactory('ArcanumGigBoard');
  const board = await Board.deploy();
  await board.waitForDeployment();

  const boardAddress = await board.getAddress();
  const boardReceipt = await board.deploymentTransaction().wait();
  const Escrow = await hre.ethers.getContractFactory('ArcanumEscrow');
  const escrow = await Escrow.deploy(boardAddress);
  await escrow.waitForDeployment();

  const escrowAddress = await escrow.getAddress();
  const escrowReceipt = await escrow.deploymentTransaction().wait();
  const configureTx = await board.configureEscrow(escrowAddress);
  await configureTx.wait();

  console.log(`ArcanumGigBoard deployed to ${boardAddress}`);
  console.log(`Gig Board deployment block: ${boardReceipt.blockNumber}`);
  console.log(`ArcanumEscrow deployed to ${escrowAddress}`);
  console.log(`Escrow deployment block: ${escrowReceipt.blockNumber}`);
  console.log(`Gig Board escrow binding: ${await board.escrowContract()}`);
  console.log(`Set NEXT_PUBLIC_GIG_BOARD_CONTRACT_ADDRESS=${boardAddress}`);
  console.log(`Set NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS=${escrowAddress}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
