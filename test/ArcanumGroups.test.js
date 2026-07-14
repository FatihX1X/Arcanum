const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const FEE_CLAIM_WALLET = '0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040';

describe('ArcanumGroups', function () {
  async function deployFixture() {
    const [owner, member, other, outsider] = await ethers.getSigners();
    const Messenger = await ethers.getContractFactory('ArcanumMessenger');
    const messenger = await Messenger.deploy();
    await messenger.waitForDeployment();

    for (const [signer, key] of [[owner, 'owner-key'], [member, 'member-key'], [other, 'other-key']]) {
      await messenger.connect(signer).registerEncryptionKey(key);
    }

    const Groups = await ethers.getContractFactory('ArcanumGroups');
    const groups = await Groups.deploy(await messenger.getAddress());
    await groups.waitForDeployment();

    return {
      groups,
      messenger,
      owner,
      member,
      other,
      outsider,
      groupId: ethers.keccak256(ethers.toUtf8Bytes('group-one')),
      fee: ethers.parseEther('0.05'),
    };
  }

  async function createDefaultGroup(fixture) {
    const { groups, owner, member, groupId } = fixture;
    await groups.connect(owner).createGroup(
      groupId,
      [owner.address, member.address],
      'encrypted-metadata-v1',
      ['owner-envelope-v1', 'member-envelope-v1'],
    );
  }

  async function impersonateFeeClaimer() {
    await network.provider.request({ method: 'hardhat_impersonateAccount', params: [FEE_CLAIM_WALLET] });
    await network.provider.send('hardhat_setBalance', [FEE_CLAIM_WALLET, '0x3635C9ADC5DEA00000']);
    return ethers.getSigner(FEE_CLAIM_WALLET);
  }

  it('creates an encrypted group and indexes every member', async function () {
    const fixture = await deployFixture();
    const { groups, owner, member, groupId } = fixture;

    await expect(groups.connect(owner).createGroup(
      groupId,
      [owner.address, member.address],
      'encrypted-metadata-v1',
      ['owner-envelope-v1', 'member-envelope-v1'],
    )).to.emit(groups, 'GroupCreated').withArgs(groupId, owner.address, 1, 2);

    const group = await groups.getGroup(groupId);
    expect(group.owner).to.equal(owner.address);
    expect(group.currentEpoch).to.equal(1);
    expect(group.encryptedMetadata).to.equal('encrypted-metadata-v1');
    expect(await groups.getMembers(groupId)).to.deep.equal([owner.address, member.address]);
    expect(await groups.getGroupsFor(member.address)).to.deep.equal([groupId]);
    expect(await groups.getKeyEnvelope(groupId, 1, member.address)).to.equal('member-envelope-v1');
  });

  it('requires registered keys, unique members, an owner member, and bounded input', async function () {
    const { groups, owner, member, outsider, groupId } = await deployFixture();

    await expect(groups.connect(owner).createGroup(
      groupId,
      [owner.address, outsider.address],
      'metadata',
      ['owner-envelope', 'outsider-envelope'],
    )).to.be.revertedWith('MEMBER_KEY_REQUIRED');

    await expect(groups.connect(owner).createGroup(
      groupId,
      [owner.address, owner.address],
      'metadata',
      ['one', 'two'],
    )).to.be.revertedWith('DUPLICATE_MEMBER');

    await expect(groups.connect(owner).createGroup(
      groupId,
      [member.address, member.address],
      'metadata',
      ['one', 'two'],
    )).to.be.reverted;

    const tooMany = Array.from({ length: 26 }, () => owner.address);
    await expect(groups.connect(owner).createGroup(
      groupId,
      tooMany,
      'metadata',
      tooMany.map((_, index) => `envelope-${index}`),
    )).to.be.revertedWith('TOO_MANY_MEMBERS');
  });

  it('rotates the epoch atomically and preserves only historical envelopes for removed members', async function () {
    const fixture = await deployFixture();
    const { groups, owner, member, other, groupId } = fixture;
    await createDefaultGroup(fixture);

    await expect(groups.connect(owner).updateMembers(
      groupId,
      [owner.address, other.address],
      'encrypted-metadata-v2',
      ['owner-envelope-v2', 'other-envelope-v2'],
    )).to.emit(groups, 'GroupMembersUpdated').withArgs(groupId, 2, 2);

    expect(await groups.isCurrentMember(groupId, member.address)).to.equal(false);
    expect(await groups.isCurrentMember(groupId, other.address)).to.equal(true);
    expect(await groups.getKeyEnvelope(groupId, 1, member.address)).to.equal('member-envelope-v1');
    expect(await groups.getKeyEnvelope(groupId, 1, other.address)).to.equal('');
    expect(await groups.getKeyEnvelope(groupId, 2, other.address)).to.equal('other-envelope-v2');
    expect(await groups.getGroupsFor(other.address)).to.deep.equal([groupId]);
  });

  it('allows only the owner to rotate membership and never allows removing the owner', async function () {
    const fixture = await deployFixture();
    const { groups, owner, member, other, groupId } = fixture;
    await createDefaultGroup(fixture);

    await expect(groups.connect(member).updateMembers(
      groupId,
      [member.address, other.address],
      'metadata-v2',
      ['member-v2', 'other-v2'],
    )).to.be.revertedWith('GROUP_OWNER_REQUIRED');

    await expect(groups.connect(owner).updateMembers(
      groupId,
      [member.address, other.address],
      'metadata-v2',
      ['member-v2', 'other-v2'],
    )).to.be.revertedWith('OWNER_MUST_BE_MEMBER');
  });

  it('charges the private fee and rejects removed members or stale epochs', async function () {
    const fixture = await deployFixture();
    const { groups, owner, member, other, groupId, fee } = fixture;
    await createDefaultGroup(fixture);

    await expect(groups.connect(member).sendGroupMessage(groupId, 1, 'ciphertext-one', { value: fee }))
      .to.emit(groups, 'GroupMessageSent')
      .withArgs(0, groupId, 1, member.address, anyValue);

    await expect(groups.connect(owner).sendGroupMessage(groupId, 1, 'ciphertext-two'))
      .to.be.revertedWith('INVALID_MESSAGE_FEE');

    await groups.connect(owner).updateMembers(
      groupId,
      [owner.address, other.address],
      'metadata-v2',
      ['owner-v2', 'other-v2'],
    );

    await expect(groups.connect(member).sendGroupMessage(groupId, 2, 'removed', { value: fee }))
      .to.be.revertedWith('GROUP_MEMBER_REQUIRED');
    await expect(groups.connect(other).sendGroupMessage(groupId, 1, 'stale', { value: fee }))
      .to.be.revertedWith('STALE_GROUP_EPOCH');
  });

  it('returns paginated messages and lets only the fee wallet claim fees', async function () {
    const fixture = await deployFixture();
    const { groups, owner, member, outsider, groupId, fee } = fixture;
    const feeClaimer = await impersonateFeeClaimer();
    await createDefaultGroup(fixture);

    await groups.connect(member).sendGroupMessage(groupId, 1, 'one', { value: fee });
    await groups.connect(owner).sendGroupMessage(groupId, 1, 'two', { value: fee });
    await groups.connect(member).sendGroupMessage(groupId, 1, 'three', { value: fee });

    const page = await groups.getMessagesPage(groupId, 1, 2);
    expect(page.map((message) => message.payload)).to.deep.equal(['two', 'three']);
    expect(await groups.messageCount(groupId)).to.equal(3);
    await expect(groups.getMessagesPage(groupId, 0, 101)).to.be.revertedWith('PAGE_TOO_LARGE');
    await expect(groups.connect(outsider).claim_fees()).to.be.revertedWith('FEE_CLAIM_NOT_ALLOWED');
    await expect(groups.connect(feeClaimer).claim_fees()).to.emit(groups, 'FeesClaimed').withArgs(FEE_CLAIM_WALLET, fee * 3n);
  });
});
