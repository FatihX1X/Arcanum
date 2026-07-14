const { expect } = require('chai');
const { ethers, network } = require('hardhat');
const { anyValue } = require('@nomicfoundation/hardhat-chai-matchers/withArgs');

const FEE_CLAIM_WALLET = '0x3406584CCD8cc2fa38BfD3ece96d5dD4371B0040';

describe('ArcanumGroup', function () {
  async function deployFixture() {
    const signers = await ethers.getSigners();
    const Keys = await ethers.getContractFactory('MockMessengerKeys');
    const keys = await Keys.deploy();
    await keys.waitForDeployment();

    const Group = await ethers.getContractFactory('ArcanumGroup');
    const group = await Group.deploy(await keys.getAddress());
    await group.waitForDeployment();

    return { group, keys, signers, fee: await group.GROUP_MESSAGE_FEE() };
  }

  async function registerKeys(keys, accounts) {
    for (const account of accounts) {
      const address = typeof account === 'string' ? account : account.address;
      await keys.setEncryptionKey(address, `public-key-${address}`);
    }
  }

  async function createGroupWithMember(group, keys, owner, member) {
    await registerKeys(keys, [owner, member]);
    await group.connect(owner).createGroup('Core team');
    await group.connect(owner).inviteMember(0, member.address);
    await group.connect(member).acceptInvite(0);
  }

  async function impersonateFeeClaimer() {
    await network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [FEE_CLAIM_WALLET],
    });
    await network.provider.send('hardhat_setBalance', [FEE_CLAIM_WALLET, '0x3635C9ADC5DEA00000']);
    return ethers.getSigner(FEE_CLAIM_WALLET);
  }

  it('requires a registered key and creates the owner as the first admin member', async function () {
    const { group, keys, signers } = await deployFixture();
    const [owner] = signers;

    await expect(group.connect(owner).createGroup('Core team')).to.be.revertedWith('ENCRYPTION_KEY_REQUIRED');
    await registerKeys(keys, [owner]);

    await expect(group.connect(owner).createGroup('Core team'))
      .to.emit(group, 'GroupCreated')
      .withArgs(0, owner.address, 'Core team', 1);

    const stored = await group.getGroup(0);
    expect(stored.owner).to.equal(owner.address);
    expect(stored.memberCount).to.equal(1);
    expect(stored.membershipVersion).to.equal(1);
    expect(await group.isMember(0, owner.address)).to.equal(true);
    expect(await group.isAdmin(0, owner.address)).to.equal(true);
    expect(await group.getAccountGroupIdsPage(owner.address, 0, 100)).to.deep.equal([0n]);
  });

  it('supports invite, accept, decline, and cancel with indexed pending groups', async function () {
    const { group, keys, signers } = await deployFixture();
    const [owner, member, other] = signers;
    await registerKeys(keys, [owner, member, other]);
    await group.connect(owner).createGroup('Invites');

    await expect(group.connect(owner).inviteMember(0, member.address))
      .to.emit(group, 'MemberInvited')
      .withArgs(0, owner.address, member.address);
    expect(await group.getPendingGroupIdsPage(member.address, 0, 100)).to.deep.equal([0n]);

    await expect(group.connect(member).acceptInvite(0))
      .to.emit(group, 'InviteAccepted')
      .withArgs(0, member.address, 2);
    expect(await group.getPendingGroupCount(member.address)).to.equal(0);
    expect(await group.getAccountGroupIdsPage(member.address, 0, 100)).to.deep.equal([0n]);

    await group.connect(owner).inviteMember(0, other.address);
    await expect(group.connect(other).declineInvite(0)).to.emit(group, 'InviteDeclined').withArgs(0, other.address);
    await group.connect(owner).inviteMember(0, other.address);
    await expect(group.connect(owner).cancelInvite(0, other.address)).to.emit(group, 'InviteCancelled').withArgs(0, other.address);
    expect(await group.hasPendingInvite(0, other.address)).to.equal(false);
  });

  it('enforces multi-admin governance and owner-only admin control', async function () {
    const { group, keys, signers } = await deployFixture();
    const [owner, admin, member, outsider] = signers;
    await registerKeys(keys, [owner, admin, member, outsider]);
    await group.connect(owner).createGroup('Governance');

    for (const account of [admin, member]) {
      await group.connect(owner).inviteMember(0, account.address);
      await group.connect(account).acceptInvite(0);
    }

    await expect(group.connect(owner).setAdmin(0, admin.address, true))
      .to.emit(group, 'AdminUpdated')
      .withArgs(0, admin.address, true);
    await expect(group.connect(admin).renameGroup(0, 'Renamed')).to.emit(group, 'GroupRenamed').withArgs(0, 'Renamed');
    await expect(group.connect(admin).inviteMember(0, outsider.address)).to.emit(group, 'MemberInvited');
    await expect(group.connect(admin).setAdmin(0, member.address, true)).to.be.revertedWith('OWNER_REQUIRED');

    await group.connect(owner).setAdmin(0, member.address, true);
    await expect(group.connect(admin).removeMember(0, member.address)).to.be.revertedWith('OWNER_REQUIRED_FOR_ADMIN');
    await expect(group.connect(owner).removeMember(0, member.address)).to.emit(group, 'MemberRemoved');

    await expect(group.connect(owner).transferOwnership(0, admin.address))
      .to.emit(group, 'OwnershipTransferred')
      .withArgs(0, owner.address, admin.address);
    expect((await group.getGroup(0)).owner).to.equal(admin.address);
    expect(await group.isAdmin(0, owner.address)).to.equal(true);
  });

  it('keeps the owner in the group until ownership is transferred', async function () {
    const { group, keys, signers } = await deployFixture();
    const [owner, member] = signers;
    await createGroupWithMember(group, keys, owner, member);

    await expect(group.connect(owner).leaveGroup(0)).to.be.revertedWith('OWNER_MUST_TRANSFER');
    await group.connect(owner).transferOwnership(0, member.address);
    await expect(group.connect(owner).leaveGroup(0)).to.emit(group, 'MemberLeft').withArgs(0, owner.address, 3);
    expect(await group.isMember(0, owner.address)).to.equal(false);
    expect((await group.getGroup(0)).membershipVersion).to.equal(3);
  });

  it('stores one ciphertext and a wrapped key for every active member', async function () {
    const { group, keys, signers, fee } = await deployFixture();
    const [owner, member] = signers;
    await createGroupWithMember(group, keys, owner, member);

    const ciphertext = ethers.toUtf8Bytes('ciphertext');
    const cryptoMeta = ethers.toUtf8Bytes('{"version":1}');
    const wraps = ['0x0102', '0x0304'];

    await expect(group.connect(owner).sendGroupMessage(0, 2, ciphertext, cryptoMeta, wraps, { value: fee }))
      .to.emit(group, 'GroupMessageSent')
      .withArgs(0, 0, owner.address, 2, anyValue);

    const ownerPage = await group.getGroupMessagesPageFor(0, owner.address, 0, 100);
    const memberPage = await group.getGroupMessagesPageFor(0, member.address, 0, 100);
    expect(ownerPage).to.have.lengthOf(1);
    expect(ethers.toUtf8String(ownerPage[0].ciphertext)).to.equal('ciphertext');
    expect(ownerPage[0].wrappedKey).to.equal('0x0102');
    expect(memberPage[0].wrappedKey).to.equal('0x0304');
    expect(await ethers.provider.getBalance(await group.getAddress())).to.equal(fee);
  });

  it('rejects stale membership, wrong fees, and incomplete wrapped key sets', async function () {
    const { group, keys, signers, fee } = await deployFixture();
    const [owner, member] = signers;
    await createGroupWithMember(group, keys, owner, member);
    const ciphertext = ethers.toUtf8Bytes('ciphertext');
    const meta = ethers.toUtf8Bytes('meta');

    await expect(group.connect(owner).sendGroupMessage(0, 1, ciphertext, meta, ['0x01', '0x02'], { value: fee }))
      .to.be.revertedWith('MEMBERSHIP_VERSION_CHANGED');
    await expect(group.connect(owner).sendGroupMessage(0, 2, ciphertext, meta, ['0x01'], { value: fee }))
      .to.be.revertedWith('WRAPPED_KEYS_MISMATCH');
    await expect(group.connect(owner).sendGroupMessage(0, 2, ciphertext, meta, ['0x01', '0x02'], { value: 0 }))
      .to.be.revertedWith('INVALID_GROUP_MESSAGE_FEE');
  });

  it('preserves historical wrapped keys while excluding removed members from future messages', async function () {
    const { group, keys, signers, fee } = await deployFixture();
    const [owner, member] = signers;
    await createGroupWithMember(group, keys, owner, member);

    await group.connect(owner).sendGroupMessage(0, 2, '0x01', '0x02', ['0x0a', '0x0b'], { value: fee });
    await group.connect(owner).removeMember(0, member.address);
    expect(await group.getWrappedKey(0, member.address)).to.equal('0x0b');

    await group.connect(owner).sendGroupMessage(0, 3, '0x03', '0x04', ['0x0c'], { value: fee });
    expect(await group.getWrappedKey(1, member.address)).to.equal('0x');
    await expect(group.connect(member).sendGroupMessage(0, 3, '0x03', '0x04', ['0x0c'], { value: fee }))
      .to.be.revertedWith('MEMBER_REQUIRED');
  });

  it('reserves group capacity for pending invites', async function () {
    const { group, keys, signers } = await deployFixture();
    const [owner, ...invitees] = signers;
    await registerKeys(keys, [owner, ...invitees]);
    await group.connect(owner).createGroup('Capacity');

    for (const invitee of invitees.slice(0, 19)) {
      await group.connect(owner).inviteMember(0, invitee.address);
    }

    const extra = ethers.Wallet.createRandom().address;
    await registerKeys(keys, [extra]);
    await expect(group.connect(owner).inviteMember(0, extra)).to.be.revertedWith('GROUP_CAPACITY_REACHED');
    expect((await group.getGroup(0)).pendingInviteCount).to.equal(19);
  });

  it('allows only the fixed fee wallet to claim accumulated fees', async function () {
    const { group, keys, signers, fee } = await deployFixture();
    const [owner, other] = signers;
    await registerKeys(keys, [owner]);
    await group.connect(owner).createGroup('Fees');
    await group.connect(owner).sendGroupMessage(0, 1, '0x01', '0x02', ['0x03'], { value: fee });

    await expect(group.connect(other).claimFees()).to.be.revertedWith('FEE_CLAIM_NOT_ALLOWED');
    const claimer = await impersonateFeeClaimer();
    await expect(group.connect(claimer).claimFees()).to.emit(group, 'FeesClaimed').withArgs(FEE_CLAIM_WALLET, fee);
    expect(await ethers.provider.getBalance(await group.getAddress())).to.equal(0);
  });
});
