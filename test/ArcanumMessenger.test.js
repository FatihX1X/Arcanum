const { expect } = require('chai');
const { ethers } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

describe('ArcanumMessenger', function () {
  async function deployFixture() {
    const [sender, recipient, treasury] = await ethers.getSigners();
    const Messenger = await ethers.getContractFactory('ArcanumMessenger');
    const messenger = await Messenger.deploy(treasury.address);
    await messenger.waitForDeployment();
    const publicFee = await messenger.PUBLIC_MESSAGE_FEE();
    const privateFee = await messenger.PRIVATE_MESSAGE_FEE();

    return { messenger, sender, recipient, treasury, publicFee, privateFee };
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

  it('rejects empty payloads and self messages', async function () {
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

  it('allows only treasury to withdraw fees', async function () {
    const { messenger, sender, recipient, treasury, publicFee } = await deployFixture();

    await messenger.connect(sender).sendMessage(recipient.address, 'hello', false, { value: publicFee });

    await expect(messenger.connect(sender).withdrawFees()).to.be.revertedWith('TREASURY_ONLY');
    await expect(messenger.connect(treasury).withdrawFees()).to.changeEtherBalances(
      [messenger, treasury],
      [-publicFee, publicFee],
    );
  });
});
