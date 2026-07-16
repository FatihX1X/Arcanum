const { expect } = require('chai');
const { ethers, network } = require('hardhat');

describe('ArcanumEscrow', function () {
  async function deployFixture(listingType = 0) {
    const [creator, responder, other, arbiter] = await ethers.getSigners();
    const Board = await ethers.getContractFactory('ArcanumGigBoard');
    const board = await Board.deploy();
    await board.waitForDeployment();
    const Escrow = await ethers.getContractFactory('ArcanumEscrow');
    const escrow = await Escrow.deploy(await board.getAddress());
    await escrow.waitForDeployment();
    await board.configureEscrow(await escrow.getAddress());

    const amount = ethers.parseEther('12');
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes('canonical delivery terms'));
    await board.connect(creator).createGig(listingType, 0, 'Arc delivery', 'Complete the agreed work.', amount);
    await board.connect(responder).startConversation(0, 'encrypted-hello');
    await board.connect(responder).proposeTerms(0, amount, 7, arbiter.address, termsHash, 'encrypted-proposal-note');
    await board.connect(creator).acceptProposal(0);

    const payer = listingType === 0 ? creator : responder;
    const provider = listingType === 0 ? responder : creator;
    return { board, escrow, creator, responder, other, arbiter, payer, provider, amount, termsHash };
  }

  async function fund(fixture) {
    await fixture.escrow.connect(fixture.payer).fundProposal(0, { value: fixture.amount });
  }

  it('atomically funds an accepted proposal and indexes every role', async function () {
    const fixture = await deployFixture();
    const { board, escrow, payer, provider, arbiter, amount, termsHash } = fixture;

    await expect(escrow.connect(payer).fundProposal(0, { value: amount }))
      .to.emit(escrow, 'EscrowLocked');

    const item = await escrow.getEscrow(0);
    expect(item.payer).to.equal(payer.address);
    expect(item.provider).to.equal(provider.address);
    expect(item.arbiter).to.equal(arbiter.address);
    expect(item.amount).to.equal(amount);
    expect(item.termsHash).to.equal(termsHash);
    expect(item.status).to.equal(0);
    expect((await board.getGig(0)).status).to.equal(1);
    expect((await board.getProposal(0)).status).to.equal(4);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amount);
    expect(await escrow.escrowCountFor(payer.address)).to.equal(1);
    expect(await escrow.escrowCountFor(provider.address)).to.equal(1);
    expect(await escrow.escrowCountFor(arbiter.address)).to.equal(1);
  });

  it('rejects the wrong payer, amount, and double funding', async function () {
    const fixture = await deployFixture();
    const { escrow, other, payer, amount } = fixture;
    await expect(escrow.connect(other).fundProposal(0, { value: amount })).to.be.revertedWith('PAYER_REQUIRED');
    await expect(escrow.connect(payer).fundProposal(0, { value: amount - 1n })).to.be.revertedWith('INVALID_ESCROW_AMOUNT');
    await fund(fixture);
    await expect(escrow.connect(payer).fundProposal(0, { value: amount })).to.be.revertedWith('PROPOSAL_NOT_FUNDABLE');
  });

  it('allows only the payer to release and only the provider to refund', async function () {
    const releaseFixture = await deployFixture();
    await fund(releaseFixture);
    await expect(releaseFixture.escrow.connect(releaseFixture.other).release(0)).to.be.revertedWith('PAYER_REQUIRED');
    await expect(() => releaseFixture.escrow.connect(releaseFixture.payer).release(0))
      .to.changeEtherBalances(
        [releaseFixture.escrow, releaseFixture.provider],
        [-releaseFixture.amount, releaseFixture.amount],
      );
    expect((await releaseFixture.escrow.getEscrow(0)).status).to.equal(1);
    expect((await releaseFixture.board.getGig(0)).status).to.equal(2);

    const refundFixture = await deployFixture();
    await fund(refundFixture);
    await expect(refundFixture.escrow.connect(refundFixture.payer).refund(0)).to.be.revertedWith('PROVIDER_REQUIRED');
    await expect(() => refundFixture.escrow.connect(refundFixture.provider).refund(0))
      .to.changeEtherBalances(
        [refundFixture.escrow, refundFixture.payer],
        [-refundFixture.amount, refundFixture.amount],
      );
    expect((await refundFixture.escrow.getEscrow(0)).status).to.equal(2);
  });

  it('keeps overdue funds locked until a party disputes and the selected arbiter resolves', async function () {
    const fixture = await deployFixture();
    const { escrow, payer, provider, other, arbiter, amount } = fixture;
    await fund(fixture);
    await network.provider.send('evm_increaseTime', [7 * 24 * 60 * 60 + 1]);
    await network.provider.send('evm_mine');

    expect(await escrow.isOverdue(0)).to.equal(true);
    expect((await escrow.getEscrow(0)).status).to.equal(0);
    const evidenceHash = ethers.keccak256(ethers.toUtf8Bytes('evidence'));
    await expect(escrow.connect(other).openDispute(0, evidenceHash, 'ipfs://evidence')).to.be.revertedWith('ESCROW_PARTY_REQUIRED');
    await expect(escrow.connect(payer).openDispute(0, evidenceHash, 'ipfs://evidence'))
      .to.emit(escrow, 'EscrowDisputed');
    expect((await escrow.getEscrow(0)).status).to.equal(3);

    const providerEvidence = ethers.keccak256(ethers.toUtf8Bytes('provider-evidence'));
    await escrow.connect(provider).submitEvidence(0, providerEvidence, 'ipfs://provider-evidence');
    expect(await escrow.evidenceCount(0)).to.equal(2);
    await expect(escrow.connect(other).resolveDispute(0, true, evidenceHash, 'ipfs://resolution')).to.be.revertedWith('ARBITER_REQUIRED');
    await expect(() => escrow.connect(arbiter).resolveDispute(0, true, evidenceHash, 'ipfs://resolution'))
      .to.changeEtherBalances([escrow, provider], [-amount, amount]);
    expect((await escrow.getEscrow(0)).status).to.equal(1);
  });

  it('supports ServiceOffer funding where the responder is payer', async function () {
    const fixture = await deployFixture(1);
    expect(fixture.payer.address).to.equal(fixture.responder.address);
    expect(fixture.provider.address).to.equal(fixture.creator.address);
    await expect(fixture.escrow.connect(fixture.payer).fundProposal(0, { value: fixture.amount }))
      .to.emit(fixture.escrow, 'EscrowLocked');
  });

  it('validates evidence and paginates user escrows', async function () {
    const fixture = await deployFixture();
    await fund(fixture);
    await expect(fixture.escrow.connect(fixture.payer).openDispute(0, ethers.ZeroHash, 'ipfs://x'))
      .to.be.revertedWith('EVIDENCE_HASH_REQUIRED');
    const page = await fixture.escrow.getEscrowsFor(fixture.payer.address, 0, 10);
    expect(page).to.have.length(1);
    await expect(fixture.escrow.getEscrowsFor(fixture.payer.address, 0, 101)).to.be.revertedWith('PAGE_TOO_LARGE');
  });

  it('reverts failed payouts atomically and blocks receiver reentrancy', async function () {
    const [payer, arbiter] = await ethers.getSigners();
    const Board = await ethers.getContractFactory('ArcanumGigBoard');
    const board = await Board.deploy();
    const Escrow = await ethers.getContractFactory('ArcanumEscrow');
    const escrow = await Escrow.deploy(await board.getAddress());
    await board.configureEscrow(await escrow.getAddress());
    const Harness = await ethers.getContractFactory('EscrowReceiverHarness');
    const receiver = await Harness.deploy();
    const amount = ethers.parseEther('3');
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes('receiver terms'));

    await board.connect(payer).createGig(0, 0, 'Receiver job', 'Exercise payout safety.', amount);
    await receiver.respondAndPropose(await board.getAddress(), 0, amount, arbiter.address, termsHash);
    await board.connect(payer).acceptProposal(0);
    await escrow.connect(payer).fundProposal(0, { value: amount });

    await receiver.configureReceiver(await escrow.getAddress(), 0, true, false);
    await expect(escrow.connect(payer).release(0)).to.be.revertedWith('PAYOUT_FAILED');
    expect((await escrow.getEscrow(0)).status).to.equal(0);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(amount);

    await receiver.configureReceiver(await escrow.getAddress(), 0, false, true);
    await escrow.connect(payer).release(0);
    expect(await receiver.reentryBlocked()).to.equal(true);
    expect((await escrow.getEscrow(0)).status).to.equal(1);
  });
});
