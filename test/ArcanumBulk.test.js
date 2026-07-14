const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const FEE_CLAIM_WALLET = '0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040';

describe('ArcanumBulk', function () {
  async function deployFixture() {
    const [sender, recipientA, recipientB, other] = await ethers.getSigners();
    const Token = await ethers.getContractFactory('MockUSDC');
    const token = await Token.deploy();
    await token.waitForDeployment();

    const Bulk = await ethers.getContractFactory('ArcanumBulk');
    const bulk = await Bulk.deploy(await token.getAddress());
    await bulk.waitForDeployment();

    const initialBalance = ethers.parseUnits('1000000', 6);
    await token.mint(sender.address, initialBalance);
    await token.connect(sender).approve(await bulk.getAddress(), ethers.MaxUint256);

    return {
      bulk,
      token,
      sender,
      recipientA,
      recipientB,
      other,
      fee: await bulk.BULK_BATCH_FEE(),
    };
  }

  function sortedRows(rows) {
    return [...rows].sort((a, b) => {
      const left = BigInt(a.recipient.toLowerCase());
      const right = BigInt(b.recipient.toLowerCase());
      return left < right ? -1 : left > right ? 1 : 0;
    });
  }

  async function impersonateFeeClaimer() {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [FEE_CLAIM_WALLET],
    });
    await network.provider.send('hardhat_setBalance', [FEE_CLAIM_WALLET, '0x3635C9ADC5DEA00000']);
    return ethers.getSigner(FEE_CLAIM_WALLET);
  }

  it('sends different 6-decimal amounts atomically and stores complete history', async function () {
    const { bulk, token, sender, recipientA, recipientB, fee } = await deployFixture();
    const rows = sortedRows([
      { recipient: recipientA.address, amount: ethers.parseUnits('12.34', 6) },
      { recipient: recipientB.address, amount: ethers.parseUnits('5.50', 6) },
    ]);
    const recipients = rows.map((row) => row.recipient);
    const amounts = rows.map((row) => row.amount);
    const total = amounts.reduce((sum, amount) => sum + amount, 0n);

    await expect(bulk.connect(sender).bulkSend(recipients, amounts, 'July payouts', { value: fee }))
      .to.emit(bulk, 'BulkBatchSent')
      .withArgs(0, sender.address, 2, total, 'July payouts', anyValue);

    for (const row of rows) {
      expect(await token.balanceOf(row.recipient)).to.equal(row.amount);
      expect(await bulk.getReceivedBatchIdsPage(row.recipient, 0, 100)).to.deep.equal([0n]);
    }

    const batch = await bulk.getBatch(0);
    expect(batch.totalAmount).to.equal(total);
    expect(batch.recipientCount).to.equal(2);
    expect(batch.message).to.equal('July payouts');
    expect(await bulk.getSentBatchIdsPage(sender.address, 0, 100)).to.deep.equal([0n]);

    const transfers = await bulk.getBatchTransfersPage(0, 0, 100);
    expect(transfers.map((item) => item.recipient)).to.deep.equal(recipients);
    expect(transfers.map((item) => item.amount)).to.deep.equal(amounts);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(fee);
  });

  it('rolls back every transfer, record, and fee when one recipient fails', async function () {
    const { bulk, token, sender, recipientA, recipientB, fee } = await deployFixture();
    const rows = sortedRows([
      { recipient: recipientA.address, amount: ethers.parseUnits('1', 6) },
      { recipient: recipientB.address, amount: ethers.parseUnits('2', 6) },
    ]);
    await token.setBlockedRecipient(recipientB.address, true);

    await expect(
      bulk.connect(sender).bulkSend(
        rows.map((row) => row.recipient),
        rows.map((row) => row.amount),
        'Atomic payout',
        { value: fee },
      ),
    ).to.be.revertedWith('RECIPIENT_BLOCKED');

    expect(await token.balanceOf(recipientA.address)).to.equal(0);
    expect(await token.balanceOf(recipientB.address)).to.equal(0);
    expect(await bulk.batchCount()).to.equal(0);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(0);
  });

  it('rejects unsorted, duplicate, self, zero, and mismatched recipient rows', async function () {
    const { bulk, sender, recipientA, recipientB, fee } = await deployFixture();
    const lowFirst = sortedRows([
      { recipient: recipientA.address, amount: 1n },
      { recipient: recipientB.address, amount: 2n },
    ]);
    const unsorted = [...lowFirst].reverse();

    await expect(bulk.connect(sender).bulkSend(unsorted.map((row) => row.recipient), unsorted.map((row) => row.amount), 'Unsorted', { value: fee }))
      .to.be.revertedWith('RECIPIENTS_NOT_SORTED_UNIQUE');
    await expect(bulk.connect(sender).bulkSend([recipientA.address, recipientA.address], [1, 2], 'Duplicate', { value: fee }))
      .to.be.revertedWith('RECIPIENTS_NOT_SORTED_UNIQUE');
    await expect(bulk.connect(sender).bulkSend([sender.address], [1], 'Self', { value: fee }))
      .to.be.revertedWith('CANNOT_SEND_TO_SELF');
    await expect(bulk.connect(sender).bulkSend([recipientA.address], [0], 'Zero', { value: fee }))
      .to.be.revertedWith('AMOUNT_REQUIRED');
    await expect(bulk.connect(sender).bulkSend([recipientA.address], [], 'Mismatch', { value: fee }))
      .to.be.revertedWith('ARRAY_LENGTH_MISMATCH');
  });

  it('enforces the 100-recipient cap, public message, allowance, and exact fee', async function () {
    const { bulk, token, sender, recipientA, fee } = await deployFixture();
    const recipients = Array.from({ length: 101 }, () => ethers.Wallet.createRandom().address)
      .sort((a, b) => (BigInt(a.toLowerCase()) < BigInt(b.toLowerCase()) ? -1 : 1));

    await expect(bulk.connect(sender).bulkSend(recipients, recipients.map(() => 1n), 'Too many', { value: fee }))
      .to.be.revertedWith('TOO_MANY_RECIPIENTS');
    await expect(bulk.connect(sender).bulkSend([recipientA.address], [1], '', { value: fee }))
      .to.be.revertedWith('MESSAGE_REQUIRED');
    await expect(bulk.connect(sender).bulkSend([recipientA.address], [1], 'Wrong fee', { value: 0 }))
      .to.be.revertedWith('INVALID_BULK_BATCH_FEE');

    await token.connect(sender).approve(await bulk.getAddress(), 0);
    await expect(bulk.connect(sender).bulkSend([recipientA.address], [1], 'No allowance', { value: fee }))
      .to.be.revertedWithCustomError(token, 'ERC20InsufficientAllowance');
  });

  it('allows only the fixed fee wallet to claim successful batch fees', async function () {
    const { bulk, sender, recipientA, other, fee } = await deployFixture();
    await bulk.connect(sender).bulkSend([recipientA.address], [1], 'Claimable', { value: fee });

    await expect(bulk.connect(other).claimFees()).to.be.revertedWith('FEE_CLAIM_NOT_ALLOWED');
    const claimer = await impersonateFeeClaimer();
    await expect(bulk.connect(claimer).claimFees()).to.emit(bulk, 'FeesClaimed').withArgs(FEE_CLAIM_WALLET, fee);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(0);
  });
});
