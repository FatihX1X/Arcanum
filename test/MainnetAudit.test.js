const { expect } = require('chai');
const hre = require('hardhat');
const { ethers } = hre;
const { verifyCode } = require('../scripts/audit-mainnet');
const { deploymentContext, requireMissing, groupRegistry } = require('../scripts/deployment-safety');

describe('Mainnet deployment and adversarial audit', function () {
  it('blocks reentrant bulk transfers without losing the legitimate payment', async function () {
    const bulk = await (await ethers.getContractFactory('ArcanumBulkSender')).deploy();
    const receiver = await (await ethers.getContractFactory('AuditReceiverHarness')).deploy();
    await receiver.configure(await bulk.getAddress(), bulk.interface.encodeFunctionData('batchSend', [[], []]), false);
    await bulk.batchSend([await receiver.getAddress()], [100], { value: 100 });
    expect(await receiver.reentryBlocked()).to.equal(true);
    expect(await bulk.batchCount()).to.equal(1);
    expect(await ethers.provider.getBalance(await receiver.getAddress())).to.equal(100);
    expect(await ethers.provider.getBalance(await bulk.getAddress())).to.equal(0);
  });

  it('rolls back rejected agent payments and blocks recipient reentry', async function () {
    const [sender] = await ethers.getSigners();
    const agents = await (await ethers.getContractFactory('ArcanumAgents')).deploy();
    const receiver = await (await ethers.getContractFactory('AuditReceiverHarness')).deploy();
    await agents.registerAgent('sender', '', '');
    await receiver.execute(await agents.getAddress(), agents.interface.encodeFunctionData('registerAgent', ['receiver', '', '']));
    const reentry = agents.interface.encodeFunctionData('sendAgentMessage', [sender.address, 'attack', false, 0]);
    await receiver.configure(await agents.getAddress(), reentry, true);
    const total = await agents.PUBLIC_MESSAGE_FEE() + 100n;
    await expect(agents.sendAgentMessage(await receiver.getAddress(), 'payload', false, 100, { value: total })).to.be.revertedWith('PAYMENT_TRANSFER_FAILED');
    expect(await agents.messageCount()).to.equal(0);
    expect(await ethers.provider.getBalance(await agents.getAddress())).to.equal(0);
    await receiver.configure(await agents.getAddress(), reentry, false);
    await agents.sendAgentMessage(await receiver.getAddress(), 'payload', false, 100, { value: total });
    expect(await receiver.reentryBlocked()).to.equal(true);
    expect(await agents.messageCount()).to.equal(1);
    expect(await ethers.provider.getBalance(await agents.getAddress())).to.equal(await agents.PUBLIC_MESSAGE_FEE());
  });

  async function fixture() {
    const [payer, provider, arbiter, outsider] = await ethers.getSigners();
    const board = await (await ethers.getContractFactory('ArcanumGigBoard')).deploy();
    const escrow = await (await ethers.getContractFactory('ArcanumEscrow')).deploy(await board.getAddress());
    await board.configureEscrow(await escrow.getAddress());
    await board.createGig(0, 0, 'Work', 'Deliver work', 100);
    await board.connect(provider).startConversation(0, 'ciphertext');
    await board.connect(provider).proposeTerms(0, 100, 7, arbiter.address, ethers.id('terms'), 'ciphertext');
    await board.acceptProposal(0);
    return { payer, provider, arbiter, outsider, board, escrow };
  }

  it('matches deployed executable code including compiler immutable ranges', async function () {
    const { board, escrow } = await fixture();
    expect((await verifyCode(ethers.provider, hre.artifacts, 'ArcanumGigBoard', await board.getAddress())).executableMatches).to.equal(true);
    expect((await verifyCode(ethers.provider, hre.artifacts, 'ArcanumEscrow', await escrow.getAddress())).executableMatches).to.equal(true);
    await expect(verifyCode(ethers.provider, hre.artifacts, 'ArcanumMessenger', await escrow.getAddress())).to.be.rejectedWith('bytecode mismatch');
  });

  it('rejects an RPC pointing at another network before deployment', async function () {
    await expect(deploymentContext({ network: { name: 'arcMainnet' }, ethers })).to.be.rejectedWith('Unexpected deployment network');
  });

  it('refuses duplicate deployments and suspicious missing code in a recorded deployment', async function () {
    const context = (code) => ({ network: { name: 'arcMainnet' }, ethers: { provider: {
      getNetwork: async () => ({ chainId: 5042n }), getCode: async () => code,
    } } });
    await expect(requireMissing(context('0x1234'), ['messenger'])).to.be.rejectedWith('refusing duplicate');
    await expect(requireMissing(context('0x'), ['messenger'])).to.be.rejectedWith('investigate before deploying');
  });

  it('does not default Groups to a testnet registry on an unconfigured network', async function () {
    const old = process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    delete process.env.NEXT_PUBLIC_CONTRACT_ADDRESS;
    try { await expect(groupRegistry(hre)).to.be.rejectedWith('Messenger address'); }
    finally { if (old !== undefined) process.env.NEXT_PUBLIC_CONTRACT_ADDRESS = old; }
  });

  it('blocks forged funding/finalization and reconfiguration', async function () {
    const { board, outsider } = await fixture();
    await expect(board.connect(outsider).markProposalFunded(0, 0)).to.be.revertedWith('ESCROW_REQUIRED');
    await expect(board.connect(outsider).markEscrowFinalized(0, 0, 1)).to.be.revertedWith('ESCROW_REQUIRED');
    await expect(board.configureEscrow(outsider.address)).to.be.revertedWith('ESCROW_ALREADY_CONFIGURED');
  });

  it('rejects funding cancelled gigs and withdrawn accepted proposals', async function () {
    const a = await fixture();
    await a.board.cancelGig(0);
    await expect(a.escrow.fundProposal(0, { value: 100 })).to.be.revertedWith('PROPOSAL_NOT_FUNDABLE');
    const b = await fixture();
    await b.board.connect(b.provider).withdrawProposal(0);
    await expect(b.escrow.fundProposal(0, { value: 100 })).to.be.revertedWith('PROPOSAL_NOT_FUNDABLE');
  });

  it('cannot pay a released escrow twice or dispute it afterward', async function () {
    const { escrow, provider } = await fixture();
    await escrow.fundProposal(0, { value: 100 });
    await escrow.release(0);
    await expect(escrow.release(0)).to.be.revertedWith('ESCROW_NOT_LOCKED');
    await expect(escrow.connect(provider).refund(0)).to.be.revertedWith('ESCROW_NOT_LOCKED');
    await expect(escrow.openDispute(0, ethers.id('evidence'), 'ipfs://proof')).to.be.revertedWith('ESCROW_NOT_LOCKED');
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(0);
  });

  it('prevents unilateral release/refund during a dispute and repeats after resolution', async function () {
    const { escrow, arbiter, provider } = await fixture();
    await escrow.fundProposal(0, { value: 100 });
    await escrow.openDispute(0, ethers.id('evidence'), 'ipfs://proof');
    await expect(escrow.release(0)).to.be.revertedWith('ESCROW_NOT_LOCKED');
    await expect(escrow.connect(provider).refund(0)).to.be.revertedWith('ESCROW_NOT_LOCKED');
    await escrow.connect(arbiter).resolveDispute(0, false, ethers.id('ruling'), 'ipfs://ruling');
    await expect(escrow.connect(arbiter).resolveDispute(0, false, ethers.id('ruling'), 'ipfs://ruling')).to.be.revertedWith('ESCROW_NOT_DISPUTED');
  });

  it('only funds one winner when multiple proposals are accepted on a gig', async function () {
    const { board, escrow, outsider, arbiter } = await fixture();
    await board.connect(outsider).startConversation(0, 'ciphertext');
    await board.connect(outsider).proposeTerms(1, 100, 7, arbiter.address, ethers.id('other'), 'ciphertext');
    await board.acceptProposal(1);
    await escrow.fundProposal(0, { value: 100 });
    await expect(escrow.fundProposal(1, { value: 100 })).to.be.revertedWith('PROPOSAL_NOT_FUNDABLE');
    expect(await escrow.escrowCount()).to.equal(1);
    expect(await ethers.provider.getBalance(await escrow.getAddress())).to.equal(100);
  });
});
