const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const FEE_CLAIM_WALLET = '0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040';

describe('ArcanumAgents', function () {
  async function deployFixture() {
    const [sender, recipient, other] = await ethers.getSigners();
    const Agents = await ethers.getContractFactory('ArcanumAgents');
    const agents = await Agents.deploy();
    await agents.waitForDeployment();
    const publicFee = await agents.PUBLIC_MESSAGE_FEE();
    const privateFee = await agents.PRIVATE_MESSAGE_FEE();

    return { agents, sender, recipient, other, publicFee, privateFee };
  }

  async function registerDefaultAgents(agents, sender, recipient) {
    await agents.connect(sender).registerAgent('Sender Agent', 'Sends work', 'ipfs://sender');
    await agents.connect(recipient).registerAgent('Recipient Agent', 'Receives work', 'ipfs://recipient');
  }

  async function impersonateFeeClaimer() {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [FEE_CLAIM_WALLET],
    });
    await network.provider.send('hardhat_setBalance', [FEE_CLAIM_WALLET, '0x3635C9ADC5DEA00000']);
    return ethers.getSigner(FEE_CLAIM_WALLET);
  }

  it('registers, updates, and deactivates an agent profile', async function () {
    const { agents, sender } = await deployFixture();

    await expect(agents.connect(sender).registerAgent('Agent One', 'First profile', 'ipfs://one'))
      .to.emit(agents, 'AgentRegistered')
      .withArgs(sender.address, 'Agent One', 'ipfs://one');

    let profile = await agents.getAgent(sender.address);
    expect(profile.agentAddress).to.equal(sender.address);
    expect(profile.name).to.equal('Agent One');
    expect(profile.isActive).to.equal(true);
    expect(await agents.isActiveAgent(sender.address)).to.equal(true);

    await expect(agents.connect(sender).updateAgent('Agent Two', 'Updated', 'ipfs://two'))
      .to.emit(agents, 'AgentUpdated')
      .withArgs(sender.address, 'Agent Two', 'ipfs://two');
    profile = await agents.getAgent(sender.address);
    expect(profile.name).to.equal('Agent Two');

    await expect(agents.connect(sender).setAgentActive(false))
      .to.emit(agents, 'AgentActiveChanged')
      .withArgs(sender.address, false);
    expect(await agents.isActiveAgent(sender.address)).to.equal(false);
  });

  it('does not expose sender parameters for agent profile, key registration, or messaging', async function () {
    const { agents } = await deployFixture();
    const registerAgent = agents.interface.getFunction('registerAgent');
    const registerEncryptionKey = agents.interface.getFunction('registerEncryptionKey');
    const sendAgentMessage = agents.interface.getFunction('sendAgentMessage');

    expect(registerAgent.inputs.map((input) => input.name)).to.deep.equal(['name', 'description', 'metadataURI']);
    expect(registerEncryptionKey.inputs.map((input) => input.name)).to.deep.equal(['publicKey']);
    expect(sendAgentMessage.inputs.map((input) => input.name)).to.deep.equal([
      'recipient',
      'payload',
      'isPrivate',
      'paymentAmount',
    ]);
  });

  it('always records the caller as agent owner, key owner, and message sender', async function () {
    const { agents, sender, recipient, other, publicFee } = await deployFixture();

    await agents.connect(other).registerAgent(sender.address, 'spoof attempt', '');
    const otherProfile = await agents.getAgent(other.address);
    const senderProfile = await agents.getAgent(sender.address);
    expect(otherProfile.agentAddress).to.equal(other.address);
    expect(otherProfile.name).to.equal(sender.address);
    expect(senderProfile.registeredAt).to.equal(0);

    await agents.connect(recipient).registerAgent('Recipient', '', '');
    await agents.connect(other).registerEncryptionKey(sender.address);
    expect(await agents.encryptionKeys(other.address)).to.equal(sender.address);
    expect(await agents.encryptionKeys(sender.address)).to.equal('');

    await agents.connect(other).sendAgentMessage(recipient.address, sender.address, false, 0, { value: publicFee });
    const recipientInbox = await agents.getInbox(recipient.address);
    const otherOutbox = await agents.getOutbox(other.address);
    const senderOutbox = await agents.getOutbox(sender.address);

    expect(recipientInbox[0].sender).to.equal(other.address);
    expect(recipientInbox[0].payload).to.equal(sender.address);
    expect(otherOutbox).to.have.lengthOf(1);
    expect(senderOutbox).to.have.lengthOf(0);
  });

  it('requires active agents for key registration and messaging', async function () {
    const { agents, sender, recipient, other, publicFee } = await deployFixture();

    await expect(agents.connect(sender).registerEncryptionKey('{"kty":"EC"}')).to.be.revertedWith('AGENT_NOT_ACTIVE');

    await agents.connect(sender).registerAgent('Sender', '', '');
    await agents.connect(sender).registerEncryptionKey('{"kty":"EC"}');

    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, 'hello', false, 0, { value: publicFee }),
    ).to.be.revertedWith('RECIPIENT_NOT_ACTIVE_AGENT');

    await agents.connect(recipient).registerAgent('Recipient', '', '');
    await agents.connect(recipient).setAgentActive(false);
    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, 'hello', false, 0, { value: publicFee }),
    ).to.be.revertedWith('RECIPIENT_NOT_ACTIVE_AGENT');

    await expect(
      agents.connect(other).sendAgentMessage(recipient.address, 'hello', false, 0, { value: publicFee }),
    ).to.be.revertedWith('SENDER_NOT_ACTIVE_AGENT');
  });

  it('sends public and private agent messages with correct fees', async function () {
    const { agents, sender, recipient, publicFee, privateFee } = await deployFixture();
    await registerDefaultAgents(agents, sender, recipient);

    await expect(agents.connect(sender).sendAgentMessage(recipient.address, 'public hello', false, 0, { value: publicFee }))
      .to.emit(agents, 'AgentMessageSent')
      .withArgs(0, sender.address, recipient.address, false, 0, anyValue)
      .and.to.emit(agents, 'FeePaid')
      .withArgs(sender.address, 0, publicFee);

    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, '{"data":"ciphertext"}', true, 0, { value: privateFee }),
    )
      .to.emit(agents, 'AgentMessageSent')
      .withArgs(1, sender.address, recipient.address, true, 0, anyValue);

    const inbox = await agents.getInbox(recipient.address);
    const outbox = await agents.getOutbox(sender.address);
    expect(inbox).to.have.lengthOf(2);
    expect(outbox).to.have.lengthOf(2);
    expect(inbox[0].payload).to.equal('public hello');
    expect(inbox[1].isPrivate).to.equal(true);
  });

  it('rejects invalid payloads and wrong total value', async function () {
    const { agents, sender, recipient, publicFee, privateFee } = await deployFixture();
    await registerDefaultAgents(agents, sender, recipient);

    await expect(
      agents.connect(sender).sendAgentMessage(sender.address, 'hello', false, 0, { value: publicFee }),
    ).to.be.revertedWith('CANNOT_MESSAGE_SELF');
    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, '', false, 0, { value: publicFee }),
    ).to.be.revertedWith('PAYLOAD_REQUIRED');
    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, 'x'.repeat(4097), false, 0, { value: publicFee }),
    ).to.be.revertedWith('PAYLOAD_TOO_LARGE');
    await expect(agents.connect(sender).sendAgentMessage(recipient.address, 'hello', false, 0)).to.be.revertedWith(
      'INVALID_TOTAL_VALUE',
    );
    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, 'hello', false, 0, { value: privateFee }),
    ).to.be.revertedWith('INVALID_TOTAL_VALUE');
  });

  it('transfers native USDC payment to the recipient and keeps only fee balance', async function () {
    const { agents, sender, recipient, publicFee } = await deployFixture();
    await registerDefaultAgents(agents, sender, recipient);
    const payment = ethers.parseEther('1.25');
    const recipientBefore = await ethers.provider.getBalance(recipient.address);

    await expect(
      agents.connect(sender).sendAgentMessage(recipient.address, 'paid task', false, payment, { value: publicFee + payment }),
    )
      .to.emit(agents, 'PaymentTransferred')
      .withArgs(sender.address, recipient.address, 0, payment);

    expect(await ethers.provider.getBalance(recipient.address)).to.equal(recipientBefore + payment);
    expect(await ethers.provider.getBalance(await agents.getAddress())).to.equal(publicFee);

    const inbox = await agents.getInbox(recipient.address);
    expect(inbox[0].paymentAmount).to.equal(payment);
  });

  it('pages inbox and outbox records', async function () {
    const { agents, sender, recipient, publicFee } = await deployFixture();
    await registerDefaultAgents(agents, sender, recipient);

    await agents.connect(sender).sendAgentMessage(recipient.address, 'one', false, 0, { value: publicFee });
    await agents.connect(sender).sendAgentMessage(recipient.address, 'two', false, 0, { value: publicFee });
    await agents.connect(sender).sendAgentMessage(recipient.address, 'three', false, 0, { value: publicFee });

    const inboxPage = await agents.getInboxPage(recipient.address, 1, 2);
    const outboxPage = await agents.getOutboxPage(sender.address, 0, 2);

    expect(await agents.getInboxCount(recipient.address)).to.equal(3);
    expect(await agents.getOutboxCount(sender.address)).to.equal(3);
    expect(inboxPage.map((item) => item.payload)).to.deep.equal(['two', 'three']);
    expect(outboxPage.map((item) => item.payload)).to.deep.equal(['one', 'two']);
    await expect(agents.getInboxPage(recipient.address, 0, 101)).to.be.revertedWith('PAGE_TOO_LARGE');
  });

  it('allows only the whitelisted developer wallet to claim fees', async function () {
    const { agents, sender, recipient, other, publicFee } = await deployFixture();
    const feeClaimer = await impersonateFeeClaimer();
    await registerDefaultAgents(agents, sender, recipient);

    expect(await agents.FEE_CLAIM_WALLET()).to.equal(FEE_CLAIM_WALLET);
    expect(await agents.feeClaimWhitelist(FEE_CLAIM_WALLET)).to.equal(true);
    expect(await agents.feeClaimWhitelist(other.address)).to.equal(false);

    await agents.connect(sender).sendAgentMessage(recipient.address, 'hello', false, 0, { value: publicFee });
    await expect(agents.connect(other).claim_fees()).to.be.revertedWith('FEE_CLAIM_NOT_ALLOWED');
    await expect(agents.connect(feeClaimer).claim_fees())
      .to.emit(agents, 'FeesClaimed')
      .withArgs(FEE_CLAIM_WALLET, publicFee);
    expect(await ethers.provider.getBalance(await agents.getAddress())).to.equal(0);
  });
});
