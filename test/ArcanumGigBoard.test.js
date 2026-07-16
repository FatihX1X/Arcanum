const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('ArcanumGigBoard', function () {
  async function deployFixture() {
    const [creator, responder, other, arbiter, escrowSigner] = await ethers.getSigners();
    const Board = await ethers.getContractFactory('ArcanumGigBoard');
    const board = await Board.deploy();
    await board.waitForDeployment();
    return { board, creator, responder, other, arbiter, escrowSigner };
  }

  async function createConversation(fixture, listingType = 0) {
    const { board, creator, responder } = fixture;
    await board.connect(creator).createGig(listingType, 0, 'Build an Arc app', 'Deliver an audited MVP.', ethers.parseEther('25'));
    await board.connect(responder).startConversation(0, 'encrypted-initial-message');
  }

  it('creates both listing types and returns paginated public gigs', async function () {
    const { board, creator } = await deployFixture();

    await expect(board.connect(creator).createGig(0, 0, 'Development job', 'Build the integration.', ethers.parseEther('10')))
      .to.emit(board, 'GigCreated')
      .withArgs(0, creator.address, 0, 0, ethers.parseEther('10'));
    await board.connect(creator).createGig(1, 1, 'Design service', 'Product design service.', ethers.parseEther('5'));

    const page = await board.getGigsPage(0, 10);
    expect(page).to.have.length(2);
    expect(page[0].listingType).to.equal(0);
    expect(page[1].listingType).to.equal(1);
    expect(await board.gigCount()).to.equal(2);
    await expect(board.getGigsPage(0, 101)).to.be.revertedWith('PAGE_TOO_LARGE');
  });

  it('opens one conversation per responder and stores participant messages', async function () {
    const fixture = await deployFixture();
    const { board, creator, responder, other } = fixture;
    await createConversation(fixture);

    const conversation = await board.getConversation(0);
    expect(conversation.creator).to.equal(creator.address);
    expect(conversation.counterparty).to.equal(responder.address);
    expect(conversation.messageCount).to.equal(1);
    expect((await board.getMessagesPage(0, 0, 10))[0].payload).to.equal('encrypted-initial-message');

    await expect(board.connect(responder).startConversation(0, 'duplicate')).to.be.revertedWith('CONVERSATION_EXISTS');
    await expect(board.connect(other).sendMessage(0, 'outsider')).to.be.revertedWith('CONVERSATION_PARTICIPANT_REQUIRED');
    await expect(board.connect(creator).sendMessage(0, 'encrypted-reply'))
      .to.emit(board, 'ChatMessageSent')
      .withArgs(0, 1, creator.address, 0, 0, anyValue);
  });

  it('derives payer and provider from WorkRequest and ServiceOffer listings', async function () {
    const work = await deployFixture();
    await createConversation(work, 0);
    const workHash = ethers.keccak256(ethers.toUtf8Bytes('work terms'));
    await work.board.connect(work.responder).proposeTerms(0, ethers.parseEther('9'), 7, work.arbiter.address, workHash, 'encrypted-work-terms');
    const workProposal = await work.board.getProposal(0);
    expect(workProposal.payer).to.equal(work.creator.address);
    expect(workProposal.provider).to.equal(work.responder.address);

    const service = await deployFixture();
    await createConversation(service, 1);
    const serviceHash = ethers.keccak256(ethers.toUtf8Bytes('service terms'));
    await service.board.connect(service.creator).proposeTerms(0, ethers.parseEther('7'), 14, service.arbiter.address, serviceHash, 'encrypted-service-terms');
    const serviceProposal = await service.board.getProposal(0);
    expect(serviceProposal.payer).to.equal(service.responder.address);
    expect(serviceProposal.provider).to.equal(service.creator.address);
  });

  it('supersedes pending terms, requires counterparty acceptance, and allows withdrawal before funding', async function () {
    const fixture = await deployFixture();
    const { board, creator, responder, arbiter } = fixture;
    await createConversation(fixture);
    const firstHash = ethers.keccak256(ethers.toUtf8Bytes('first'));
    const secondHash = ethers.keccak256(ethers.toUtf8Bytes('second'));

    await board.connect(responder).proposeTerms(0, ethers.parseEther('8'), 7, arbiter.address, firstHash, 'encrypted-first');
    await expect(board.connect(creator).proposeTerms(0, ethers.parseEther('9'), 14, arbiter.address, secondHash, 'encrypted-second'))
      .to.emit(board, 'ProposalSuperseded')
      .withArgs(0, 1);
    expect((await board.getProposal(0)).status).to.equal(3);

    await expect(board.connect(creator).acceptProposal(1)).to.be.revertedWith('PROPOSER_CANNOT_ACCEPT');
    await expect(board.connect(responder).acceptProposal(1)).to.emit(board, 'ProposalAccepted').withArgs(1, responder.address);
    await expect(board.connect(creator).proposeTerms(0, ethers.parseEther('10'), 7, arbiter.address, firstHash, 'blocked'))
      .to.be.revertedWith('ACCEPTED_PROPOSAL_ACTIVE');
    await board.connect(responder).withdrawProposal(1);
    expect((await board.getProposal(1)).status).to.equal(2);
  });

  it('validates independent arbitration, timeout presets, bounded content, and one-time escrow configuration', async function () {
    const fixture = await deployFixture();
    const { board, creator, responder, arbiter, escrowSigner } = fixture;
    await createConversation(fixture);
    const termsHash = ethers.keccak256(ethers.toUtf8Bytes('terms'));

    await expect(board.connect(responder).proposeTerms(0, 1, 10, arbiter.address, termsHash, 'note')).to.be.revertedWith('INVALID_TIMEOUT');
    await expect(board.connect(responder).proposeTerms(0, 1, 7, creator.address, termsHash, 'note'))
      .to.be.revertedWith('ARBITER_MUST_BE_INDEPENDENT');
    await expect(board.connect(creator).createGig(0, 0, '', 'body', 1)).to.be.revertedWith('TITLE_REQUIRED');
    await expect(board.connect(creator).createGig(0, 0, 'x'.repeat(121), 'body', 1)).to.be.revertedWith('TITLE_TOO_LARGE');

    await expect(board.connect(creator).configureEscrow(escrowSigner.address))
      .to.emit(board, 'EscrowContractConfigured')
      .withArgs(escrowSigner.address);
    await expect(board.connect(creator).configureEscrow(arbiter.address)).to.be.revertedWith('ESCROW_ALREADY_CONFIGURED');
    await expect((await deployFixture()).board.connect(responder).configureEscrow(escrowSigner.address)).to.be.revertedWith('CONFIGURATOR_REQUIRED');
  });
});
