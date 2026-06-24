const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('ArcanumMessenger', function () {
  async function deployFixture() {
    const [sender, recipient] = await ethers.getSigners();
    const Messenger = await ethers.getContractFactory('ArcanumMessenger');
    const messenger = await Messenger.deploy();
    await messenger.waitForDeployment();

    return { messenger, sender, recipient };
  }

  it('registers an encryption key', async function () {
    const { messenger, sender } = await deployFixture();

    await expect(messenger.connect(sender).registerEncryptionKey('{"kty":"EC"}'))
      .to.emit(messenger, 'EncryptionKeyRegistered')
      .withArgs(sender.address, '{"kty":"EC"}');

    expect(await messenger.encryptionKeys(sender.address)).to.equal('{"kty":"EC"}');
  });

  it('sends a public message and indexes inbox and outbox', async function () {
    const { messenger, sender, recipient } = await deployFixture();

    await expect(messenger.connect(sender).sendMessage(recipient.address, 'hello', false))
      .to.emit(messenger, 'MessageSent')
      .withArgs(0, sender.address, recipient.address, false, anyValue);

    const inbox = await messenger.getInbox(recipient.address);
    const outbox = await messenger.getOutbox(sender.address);

    expect(inbox).to.have.lengthOf(1);
    expect(outbox).to.have.lengthOf(1);
    expect(inbox[0].payload).to.equal('hello');
    expect(inbox[0].isPrivate).to.equal(false);
  });

  it('sends an encrypted payload as a private message', async function () {
    const { messenger, sender, recipient } = await deployFixture();
    const encryptedPayload = '{"iv":"abc","data":"ciphertext"}';

    await messenger.connect(sender).sendMessage(recipient.address, encryptedPayload, true);

    const inbox = await messenger.getInbox(recipient.address);
    expect(inbox[0].payload).to.equal(encryptedPayload);
    expect(inbox[0].isPrivate).to.equal(true);
  });

  it('rejects empty payloads and self messages', async function () {
    const { messenger, sender } = await deployFixture();

    await expect(messenger.connect(sender).sendMessage(sender.address, 'hello', false)).to.be.revertedWith(
      'CANNOT_MESSAGE_SELF',
    );
    await expect(messenger.connect(sender).sendMessage(ethers.ZeroAddress, 'hello', false)).to.be.revertedWith(
      'RECIPIENT_REQUIRED',
    );
    await expect(messenger.connect(sender).sendMessage(ethers.Wallet.createRandom().address, '', false)).to.be.revertedWith(
      'PAYLOAD_REQUIRED',
    );
  });
});
