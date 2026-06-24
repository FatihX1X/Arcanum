const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const FEE_CLAIM_WALLET = '0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040';

describe('ArcanumMessenger', function () {
  async function deployFixture() {
    const [sender, recipient, other] = await ethers.getSigners();
    const Messenger = await ethers.getContractFactory('ArcanumMessenger');
    const messenger = await Messenger.deploy();
    await messenger.waitForDeployment();
    const publicFee = await messenger.PUBLIC_MESSAGE_FEE();
    const privateFee = await messenger.PRIVATE_MESSAGE_FEE();

    return { messenger, sender, recipient, other, publicFee, privateFee };
  }

  async function impersonateFeeClaimer() {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [FEE_CLAIM_WALLET],
    });
    await network.provider.send('hardhat_setBalance', [FEE_CLAIM_WALLET, '0x3635C9ADC5DEA00000']);
    return ethers.getSigner(FEE_CLAIM_WALLET);
  }

  it('registers an encryption key', async function () {
    const { messenger, sender } = await deployFixture();

    await expect(messenger.connect(sender).registerEncryptionKey('{"kty":"EC"}'))
      .to.emit(messenger, 'EncryptionKeyRegistered')
      .withArgs(sender.address, '{"kty":"EC"}');

    expect(await messenger.encryptionKeys(sender.address)).to.equal('{"kty":"EC"}');
  });

  it('sends a public message and indexes inbox and outbox', async function () {
    const { messenger, sender, recipient, publicFee } = await deployFixture();

    await expect(messenger.connect(sender).sendMessage(recipient.address, 'hello', false, { value: publicFee }))
      .to.emit(messenger, 'MessageSent')
      .withArgs(0, sender.address, recipient.address, false, anyValue)
      .and.to.emit(messenger, 'FeePaid')
      .withArgs(sender.address, 0, publicFee);

    const inbox = await messenger.getInbox(recipient.address);
    const outbox = await messenger.getOutbox(sender.address);

    expect(inbox).to.have.lengthOf(1);
    expect(outbox).to.have.lengthOf(1);
    expect(inbox[0].payload).to.equal('hello');
    expect(inbox[0].isPrivate).to.equal(false);
  });

  it('sends an encrypted payload as a private message', async function () {
    const { messenger, sender, recipient, privateFee } = await deployFixture();
    const encryptedPayload = '{"iv":"abc","data":"ciphertext"}';

    await messenger.connect(sender).sendMessage(recipient.address, encryptedPayload, true, { value: privateFee });

    const inbox = await messenger.getInbox(recipient.address);
    expect(inbox[0].payload).to.equal(encryptedPayload);
    expect(inbox[0].isPrivate).to.equal(true);
  });

  it('rejects empty payloads, oversized payloads, and self messages', async function () {
    const { messenger, sender, publicFee } = await deployFixture();

    await expect(messenger.connect(sender).sendMessage(sender.address, 'hello', false, { value: publicFee })).to.be.revertedWith(
      'CANNOT_MESSAGE_SELF',
    );
    await expect(messenger.connect(sender).sendMessage(ethers.ZeroAddress, 'hello', false, { value: publicFee })).to.be.revertedWith(
      'RECIPIENT_REQUIRED',
    );
    await expect(messenger.connect(sender).sendMessage(ethers.Wallet.createRandom().address, '', false, { value: publicFee })).to.be.revertedWith(
      'PAYLOAD_REQUIRED',
    );
    await expect(
      messenger.connect(sender).sendMessage(ethers.Wallet.createRandom().address, 'x'.repeat(4097), false, { value: publicFee }),
    ).to.be.revertedWith('PAYLOAD_TOO_LARGE');
  });

  it('rejects messages with the wrong fee', async function () {
    const { messenger, sender, recipient, publicFee, privateFee } = await deployFixture();

    await expect(messenger.connect(sender).sendMessage(recipient.address, 'hello', false)).to.be.revertedWith(
      'INVALID_MESSAGE_FEE',
    );
    await expect(
      messenger.connect(sender).sendMessage(recipient.address, 'hello', false, { value: privateFee }),
    ).to.be.revertedWith('INVALID_MESSAGE_FEE');
    await expect(
      messenger.connect(sender).sendMessage(recipient.address, '{"data":"ciphertext"}', true, { value: publicFee }),
    ).to.be.revertedWith('INVALID_MESSAGE_FEE');
  });

  it('pages inbox and outbox records', async function () {
    const { messenger, sender, recipient, publicFee } = await deployFixture();

    await messenger.connect(sender).sendMessage(recipient.address, 'one', false, { value: publicFee });
    await messenger.connect(sender).sendMessage(recipient.address, 'two', false, { value: publicFee });
    await messenger.connect(sender).sendMessage(recipient.address, 'three', false, { value: publicFee });

    const inboxPage = await messenger.getInboxPage(recipient.address, 1, 2);
    const outboxPage = await messenger.getOutboxPage(sender.address, 0, 2);

    expect(await messenger.getInboxCount(recipient.address)).to.equal(3);
    expect(await messenger.getOutboxCount(sender.address)).to.equal(3);
    expect(inboxPage.map((item) => item.payload)).to.deep.equal(['two', 'three']);
    expect(outboxPage.map((item) => item.payload)).to.deep.equal(['one', 'two']);
    await expect(messenger.getInboxPage(recipient.address, 0, 101)).to.be.revertedWith('PAGE_TOO_LARGE');
  });

  it('allows only the whitelisted developer wallet to claim fees', async function () {
    const { messenger, sender, recipient, other, publicFee } = await deployFixture();
    const feeClaimer = await impersonateFeeClaimer();

    expect(await messenger.FEE_CLAIM_WALLET()).to.equal(FEE_CLAIM_WALLET);
    expect(await messenger.feeClaimWhitelist(FEE_CLAIM_WALLET)).to.equal(true);
    expect(await messenger.feeClaimWhitelist(other.address)).to.equal(false);

    await messenger.connect(sender).sendMessage(recipient.address, 'hello', false, { value: publicFee });
    await expect(messenger.connect(other).claim_fees()).to.be.revertedWith('FEE_CLAIM_NOT_ALLOWED');
    await expect(messenger.connect(feeClaimer).claim_fees())
      .to.emit(messenger, 'FeesClaimed')
      .withArgs(FEE_CLAIM_WALLET, publicFee);
    expect(await ethers.provider.getBalance(await messenger.getAddress())).to.equal(0);
  });
});
