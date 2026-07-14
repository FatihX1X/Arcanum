const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('ArcanumBulkSender', function () {
  async function deployFixture() {
    const [sender, first, second] = await ethers.getSigners();
    const BulkSender = await ethers.getContractFactory('ArcanumBulkSender');
    const bulk = await BulkSender.deploy();
    await bulk.waitForDeployment();

    const Harness = await ethers.getContractFactory('BulkRecipientHarness');
    const harness = await Harness.deploy();
    await harness.waitForDeployment();

    return { bulk, harness, sender, first, second };
  }

  it('sends native USDC to every recipient and emits an auditable batch', async function () {
    const { bulk, sender, first, second } = await deployFixture();
    const firstAmount = ethers.parseEther('1.25');
    const secondAmount = ethers.parseEther('2.75');
    const firstBefore = await ethers.provider.getBalance(first.address);
    const secondBefore = await ethers.provider.getBalance(second.address);

    await expect(bulk.connect(sender).batchSend(
      [first.address, second.address],
      [firstAmount, secondAmount],
      { value: firstAmount + secondAmount },
    )).to.emit(bulk, 'BatchSent').withArgs(0, sender.address, 2, firstAmount + secondAmount);

    expect(await ethers.provider.getBalance(first.address)).to.equal(firstBefore + firstAmount);
    expect(await ethers.provider.getBalance(second.address)).to.equal(secondBefore + secondAmount);
    expect(await bulk.batchCount()).to.equal(1);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(0);
  });

  it('validates list shape, recipient values, and the exact native amount', async function () {
    const { bulk, sender, first } = await deployFixture();
    const amount = ethers.parseEther('1');

    await expect(bulk.connect(sender).batchSend([], [], { value: 0 })).to.be.revertedWith('RECIPIENTS_REQUIRED');
    await expect(bulk.connect(sender).batchSend([first.address], [], { value: 0 })).to.be.revertedWith('ARRAY_LENGTH_MISMATCH');
    await expect(bulk.connect(sender).batchSend([ethers.ZeroAddress], [amount], { value: amount })).to.be.revertedWith('RECIPIENT_REQUIRED');
    await expect(bulk.connect(sender).batchSend([first.address], [0], { value: 0 })).to.be.revertedWith('AMOUNT_REQUIRED');
    await expect(bulk.connect(sender).batchSend([first.address], [amount], { value: amount - 1n })).to.be.revertedWith('INVALID_TOTAL_VALUE');

    const tooManyRecipients = Array.from({ length: 101 }, () => first.address);
    const tooManyAmounts = Array.from({ length: 101 }, () => 1n);
    await expect(bulk.connect(sender).batchSend(tooManyRecipients, tooManyAmounts, { value: 101n }))
      .to.be.revertedWith('TOO_MANY_RECIPIENTS');
  });

  it('reverts the entire batch if any recipient rejects the transfer', async function () {
    const { bulk, harness, sender, first } = await deployFixture();
    const amount = ethers.parseEther('1');
    const firstBefore = await ethers.provider.getBalance(first.address);
    await harness.setRejectTransfers(true);

    await expect(bulk.connect(sender).batchSend(
      [first.address, await harness.getAddress()],
      [amount, amount],
      { value: amount * 2n },
    )).to.be.revertedWith('TRANSFER_FAILED');

    expect(await ethers.provider.getBalance(first.address)).to.equal(firstBefore);
    expect(await bulk.batchCount()).to.equal(0);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(0);
  });
});
